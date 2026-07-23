# Approval Prototypes

## Helios Control Surface

`helios-control-surface.html` is the first interactive approval prototype. It is self-contained and may be opened directly in a modern browser.

It is deliberately representative rather than connected to production: the room names and interface states are grounded in the Bradgate plan, while the energy values and scheduled slots are illustrative. Its purpose is to agree the form and composition before implementation in `apps/web`.

Review it against the product quality gate:

1. Does each view make the important current state legible before asking for action?
2. Are the common room actions immediate while deeper device control stays one level down?
3. Does a command only look complete after confirmation, and does an unavailable device remain obvious but quiet?
4. Does the composition work as a focused phone surface and as a contextual workstation surface?

