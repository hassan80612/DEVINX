# DEVINX visual architecture

The UI has three layers and should stay that way:

1. `globals.css` — design tokens and generic primitives.
2. `hub.css` — layout, spacing, grids and component geometry.
3. `theme.css` — component appearance using the tokens from `globals.css`.

For future visual changes, change the tokens in `:root` first. Backgrounds, typography, accent color, positive/negative colors, surfaces, borders, radii and shadows are centralized there.

Do not add `!important` to solve styling conflicts. Do not append a second theme override block. If a component needs a new visual state, add a semantic class in the component and style that class in `theme.css`.
