// Spec 078: the chosen option of any "pick one" control (segmented, chip, range pill, option card)
// is drawn in the action blue with white text, never in ink. Ink stays for text, bands and
// confirmation buttons. White on `action` is 5.36:1 (AA). Option cards keep their own background and
// only take the border and the radio dot in action.
export const selectedFill = 'border-action bg-action text-white'
export const selectedCard = 'border-action'
export const selectedDotRing = 'border-action'
export const selectedDot = 'bg-action'
