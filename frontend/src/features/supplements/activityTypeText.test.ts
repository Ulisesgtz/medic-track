import { describe, expect, it } from 'vitest'
import { ACTIVITY_TYPE_TEXT, activityCount, changeLabel, chooseLegend } from './activityTypeText'

describe('ACTIVITY_TYPE_TEXT', () => {
  it('never judges, advises or alarms (Principio I)', () => {
    for (const sentence of Object.values(ACTIVITY_TYPE_TEXT)) {
      expect(sentence).not.toMatch(/deber|recomend|conviene|riesgo|peligro|urgente|cuidado|error|equivoc|incorrect|\bbien\b|\bmal\b|sugerim|sugier/i)
    }
  })

  it('says what is asked and that nothing else changes', () => {
    expect(ACTIVITY_TYPE_TEXT.legend).toBe('Tipo de actividad')
    expect(ACTIVITY_TYPE_TEXT.missing).toBe('Elige el tipo de actividad.')
    expect(ACTIVITY_TYPE_TEXT.dialogText).toBe('Solo organiza la lista. No cambia los horarios ni los avisos.')
  })

  it('words the count, the legend and the name of the button as the mock does', () => {
    expect(activityCount(1)).toBe('1 actividad')
    expect(activityCount(2)).toBe('2 actividades')
    expect(chooseLegend('Deportiva')).toBe('Elige un tipo · Actual: Deportiva')
    expect(changeLabel('Deportiva')).toBe('Cambiar el tipo de actividad, ahora Deportiva')
    for (const sentence of [activityCount(3), chooseLegend('Escolar'), changeLabel('Otra')]) {
      expect(sentence).not.toMatch(/deber|recomend|riesgo|cuidado/i)
    }
  })
})
