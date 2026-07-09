# public/modules/ui

Purpose: shared visual primitives, panel shell helpers, icon contracts, mobile layout notes, and CSS ownership docs.

Current state: global CSS is still `public/styles.css`; several modules inject local `<style>` tags at runtime.

Construction rule: shared UI tokens and reusable primitives belong here. Feature-specific CSS should stay with the owning feature module.

Do not place feature behavior or storage logic here.
