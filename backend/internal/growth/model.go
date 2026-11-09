// Package growth is a child's growth record (specs/063-curvas-crecimiento): the weight and height a parent writes down after each
// check-up, and the chart that puts them over the WHO reference curves. The app records and draws; it never computes, stores or
// says a child's percentile or z-score, and never words a judgement (Principio I). The note and the values travel only in JSON
// bodies, never in an address, a message or error_logs.
package growth

import (
	"time"

	"github.com/google/uuid"
)

// MaxPerChild is how many measurements one child keeps at most: generous for a lifetime of check-ups, a guard against a runaway
// client filling the table.
const MaxPerChild = 500

// PlanLimitGrowthChart is the reason the API sends when a family without the paid plan asks for the chart.
const PlanLimitGrowthChart = "growth_chart"

// Sex chooses which WHO table the chart uses. It is optional and asked only for the chart.
type Sex string

// The two WHO tables.
const (
	Female Sex = "female"
	Male   Sex = "male"
)

// Input is what a parent sends to write down or correct a measurement. At least one of the two values.
type Input struct {
	MeasuredOn string // YYYY-MM-DD
	WeightKg   *float64
	HeightCm   *float64
	Note       string
}

// Cleaned is an Input that passed validation: trimmed and parsed, the empty note as nil.
type Cleaned struct {
	MeasuredOn time.Time
	WeightKg   *float64
	HeightCm   *float64
	Note       *string
}

// Measurement is one measurement as it is read back, with the first names of who wrote it down and who corrected it last.
type Measurement struct {
	ID              uuid.UUID
	ChildID         uuid.UUID
	MeasuredOn      string // YYYY-MM-DD
	WeightKg        *float64
	HeightCm        *float64
	Note            *string
	CreatedByName   string
	CreatedAt       time.Time
	CorrectedByName *string
	CorrectedAt     *time.Time
}

// Child is what the growth record needs of the child: the birth date, the family's plan, the chosen WHO table and the weight and
// height written at signup (without a date: they are shown apart and never drawn).
type Child struct {
	BirthDate time.Time
	Paid      bool
	Sex       *Sex
	WeightKg  *float64
	HeightCm  *float64
}

// List is the growth screen's data: the measurements, newest first, and the child's own data.
type List struct {
	Child        Child
	Measurements []Measurement
}

// Point is one month of a WHO reference: the published P3, P15, P50, P85 and P97 (never L, M or S).
type Point struct {
	Months                 int
	P3, P15, P50, P85, P97 float64
}

// ChartPoint is one measurement placed on the chart: its date, its age in months since birth and its value.
type ChartPoint struct {
	MeasuredOn string
	Months     float64
	Value      float64
}

// Reference is the WHO curves of one indicator for the chosen table.
type Reference struct {
	MaxMonths int
	Curves    []Point
}

// Chart is what the chart draws. Reference is nil while no WHO table was chosen; ReferenceAvailable is false (and the curves
// empty) while WHO_GROWTH_REFERENCE_ENABLED is off.
type Chart struct {
	BirthDate          string
	Sex                *Sex
	Weight, Height     []ChartPoint
	ReferenceAvailable bool
	WeightReference    *Reference
	HeightReference    *Reference
}
