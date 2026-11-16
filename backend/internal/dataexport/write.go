package dataexport

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	_ "time/tzdata" // the zone database inside the binary (distroless has none)
)

// ErrPhotoGone is what a PhotoSource returns for a photo that was deleted after the export's snapshot was taken: Write skips
// it (and says so in fotos/OMITIDAS.txt) instead of aborting the whole download. Any other error still aborts.
var ErrPhotoGone = errors.New("the photo no longer exists")

// PhotoSource reads one photo's bytes (one at a time: a ZIP of a hundred prescriptions never sits whole in memory).
type PhotoSource func(ctx context.Context, p Photo) ([]byte, error)

// readme is LEEME.txt. Only facts about the files: nothing about health.
const readme = `Tus datos de PediTrack
======================

Este archivo tiene todo lo que registraste en PediTrack hasta el %s (hora de Ciudad de México).
Es tuyo: puedes abrirlo sin PediTrack, guardarlo o llevarlo a otra aplicación.

Qué hay aquí
------------
- datos.json: todo junto, en un formato que otras aplicaciones pueden leer.
- Un archivo .csv por cada tipo de registro. Se abren con Excel, Numbers o Google Sheets:
%s
- fotos/: las fotos que guardaste (recetas, cartilla de vacunación y botiquín). La columna "foto" de cada .csv dice cuál
  le corresponde a cada registro.

Cómo leerlo
-----------
- Las fechas van como AAAA-MM-DD y las horas con su zona: "2026-10-01 08:00:00-06" es el 1 de octubre de 2026 a las
  8 de la mañana, hora de Ciudad de México.
- Los identificadores (columnas "id", "hijo_id", "consulta_id"...) unen un archivo con otro: por ejemplo, cada toma dice
  de qué medicamento es, y cada medicamento de qué consulta.
- "estado" de una toma es lo mismo que muestra la app: dada, por marcar, sin registrar, programada o cancelada.
- Una celda vacía es un dato que no se capturó.

Lo que hay aquí es lo que tú y tu familia registraron, tal cual: PediTrack no lo interpreta.
`

// Write writes the ZIP of an export to w, reading the photos one by one from photos.
func Write(ctx context.Context, w io.Writer, e *Export, photos PhotoSource) error {
	zw := zip.NewWriter(w)
	modified := e.GeneratedAt

	var list strings.Builder
	for _, t := range e.Tables {
		fmt.Fprintf(&list, "  - %s.csv (%d)\n", t.Name, len(t.Rows))
	}
	if err := writeFile(zw, "LEEME.txt", modified, func(w io.Writer) error {
		_, err := fmt.Fprintf(w, readme, e.GeneratedAt.In(mexicoCity).Format("2006-01-02 15:04"), strings.TrimRight(list.String(), "\n"))
		return err
	}); err != nil {
		return err
	}
	if err := writeFile(zw, "datos.json", modified, func(w io.Writer) error { return writeJSON(w, e) }); err != nil {
		return err
	}
	for _, t := range e.Tables {
		t := t
		if err := writeFile(zw, t.Name+".csv", modified, func(w io.Writer) error { return writeCSV(w, t) }); err != nil {
			return err
		}
	}
	var skipped []string
	for _, p := range e.Photos {
		if err := ctx.Err(); err != nil {
			return err
		}
		b, err := photos(ctx, p)
		if errors.Is(err, ErrPhotoGone) {
			skipped = append(skipped, p.Path())
			continue
		}
		if err != nil {
			return fmt.Errorf("reading a photo: %w", err)
		}
		if err := writeFile(zw, p.Path(), modified, func(w io.Writer) error {
			_, err := w.Write(b)
			return err
		}); err != nil {
			return err
		}
	}
	if len(skipped) > 0 {
		if err := writeFile(zw, "fotos/OMITIDAS.txt", modified, func(w io.Writer) error {
			_, err := fmt.Fprintf(w, "Estas fotos se borraron mientras se preparaba el archivo y no se incluyeron:\n- %s\n", strings.Join(skipped, "\n- "))
			return err
		}); err != nil {
			return err
		}
	}
	if err := zw.Close(); err != nil {
		return fmt.Errorf("closing the ZIP: %w", err)
	}
	return nil
}

func writeFile(zw *zip.Writer, name string, modified time.Time, write func(io.Writer) error) error {
	f, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: modified})
	if err != nil {
		return fmt.Errorf("adding %s: %w", name, err)
	}
	if err := write(f); err != nil {
		return fmt.Errorf("writing %s: %w", name, err)
	}
	return nil
}

// writeJSON writes {"generado_el": …, "<table>": [{column: value, …}], …}, keeping the order of tables and columns.
func writeJSON(w io.Writer, e *Export) error {
	bw := bufio.NewWriter(w)
	str := func(s string) string {
		b, _ := json.Marshal(s)
		return string(b)
	}
	fmt.Fprintf(bw, "{\n  \"generado_el\": %s", str(e.GeneratedAt.In(mexicoCity).Format(time.RFC3339)))
	for _, t := range e.Tables {
		fmt.Fprintf(bw, ",\n  %s: [", str(t.Name))
		for i, row := range t.Rows {
			if i > 0 {
				bw.WriteString(",")
			}
			bw.WriteString("\n    {")
			for c, name := range t.Columns {
				if c > 0 {
					bw.WriteString(", ")
				}
				value := "null"
				if row[c] != nil {
					value = str(*row[c])
				}
				fmt.Fprintf(bw, "%s: %s", str(name), value)
			}
			bw.WriteString("}")
		}
		if len(t.Rows) > 0 {
			bw.WriteString("\n  ")
		}
		bw.WriteString("]")
	}
	bw.WriteString("\n}\n")
	return bw.Flush()
}

// utf8BOM is the byte-order mark of UTF-8.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// writeCSV writes a table in UTF-8 with a byte-order mark, which is what makes Excel show accents and emojis right.
func writeCSV(w io.Writer, t Table) error {
	if _, err := w.Write(utf8BOM); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	if err := cw.Write(t.Columns); err != nil {
		return err
	}
	record := make([]string, len(t.Columns))
	for _, row := range t.Rows {
		for i, v := range row {
			record[i] = ""
			if v != nil {
				record[i] = *v
			}
		}
		if err := cw.Write(record); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

var mexicoCity = func() *time.Location {
	if loc, err := time.LoadLocation("America/Mexico_City"); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*60*60)
}()
