package growth

import (
	"math"
	"time"
)

// daysPerMonth is the WHO's convention to turn an age in days into months.
const daysPerMonth = 30.4375

// ReferenceFor is the WHO curves of the weight and the height for the chosen table, month by month, as published (whodata_gen.go).
func ReferenceFor(sex Sex) (weight, height Reference) {
	w, h := weightMale, heightMale
	if sex == Female {
		w, h = weightFemale, heightFemale
	}
	return Reference{MaxMonths: w[len(w)-1].Months, Curves: w}, Reference{MaxMonths: h[len(h)-1].Months, Curves: h}
}

// AgeInMonths is the age at `on` counted from `birth`, in months with two decimals (days / 30.4375, as the WHO tables).
func AgeInMonths(birth, on time.Time) float64 {
	b := time.Date(birth.Year(), birth.Month(), birth.Day(), 0, 0, 0, 0, time.UTC)
	d := time.Date(on.Year(), on.Month(), on.Day(), 0, 0, 0, 0, time.UTC)
	days := d.Sub(b).Hours() / 24
	return math.Round(days/daysPerMonth*100) / 100
}
