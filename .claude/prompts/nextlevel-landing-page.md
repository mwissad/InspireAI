# Next-Level Landing Page — Full End-to-End Prompt

Use this prompt in a **new Claude Code conversation** where the ui-ux-pro-max skill is installed. Copy everything below the line and paste it as your first message.

---

## THE PROMPT

I need you to design and build a world-class landing page for **Inspire AI** — a Databricks App that uses AI to discover analytics use cases from Unity Catalog metadata. This must look like it belongs on a $1B SaaS company's website.

### PHASE 1: RESEARCH & STYLE SELECTION

Before writing any code, use the ui-ux-pro-max skill to research the best approach. Run these searches and tell me what you find:

1. **Style search:** Search the `style` domain for styles that match "SaaS", "AI", "data platform", "dark mode", "premium". Recommend the top 3 styles and explain why each fits. I'm leaning toward a combination of **Aurora UI + Bento Grid + Glassmorphism** but convince me if there's something better.

2. **Color search:** Search the `color` domain for palettes that work with:
   - Primary brand: Databricks Red `#FF3621`
   - Dark background: near-black `#09090B`
   - Data/analytics/enterprise feel
   Recommend the complete palette with all token values (surface, border, text hierarchy, status colors).

3. **Typography search:** Search the `typography` domain for font pairings that:
   - Feel premium and technical (not playful)
   - Work great for large headlines (text-7xl)
   - Have excellent readability at small sizes (text-xs)
   - Are available on Google Fonts for free
   Recommend top 3 pairings with specific weights.

4. **Landing page pattern:** Search the `landing` data for the best pattern for an "AI-powered SaaS tool". Tell me the recommended section order, CTA placement strategy, and conversion optimization tips.

5. **Product type match:** Search `product` domain for "data analytics", "AI platform", "enterprise SaaS". What style rules and UX patterns does it recommend?

### PHASE 2: DESIGN SYSTEM DEFINITION

Based on Phase 1 research, define the complete design system before any code:

**Color Tokens (give me exact values):**
- Background, Surface, Surface-hover, Panel
- Border (3 levels: subtle, default, strong)
- Text (4 levels: primary, secondary, muted, disabled)
- Accent (primary, hover, glow, surface, border)
- Status (success, warning, error, info — each with bg variant)

**Typography Scale:**
- Hero headline: size, weight, line-height, letter-spacing
- Section headline: size, weight
- Card title: size, weight
- Body: size, weight, line-height
- Caption/label: size, weight
- Monospace (for data/IDs): font-family, size

**Spacing Scale:**
- Hero section padding
- Section padding (vertical)
- Card padding
- Element gap sizes (small, medium, large)
- Max content width

**Component Recipes:**
- Primary CTA button (with hover, active, focus states)
- Ghost/secondary button
- Badge/pill
- Card (with hover state)
- Input field (with focus state)
- Glass nav header

**Animation Tokens:**
- Transition duration + easing
- Hover lift amount
- Entrance stagger delay
- Marquee scroll speed

### PHASE 3: SECTION-BY-SECTION BUILD

Now build the landing page as a single React + Tailwind component. Use lucide-react for icons. No external animation libraries.

**Section 1 — Sticky Glass Navigation**
- Logo (Databricks stacked layers) + "Inspire AI" wordmark + version badge
- Ghost "Launch App" button on right
- `backdrop-blur-xl` glass effect on scroll
- Check: contrast ratio, touch target size, keyboard navigation

**Section 2 — Hero (above the fold)**
- Left-aligned layout (not centered)
- Pulsing status badge: "Powered by Databricks Foundation Models"
- Headline: text-7xl with animated typing effect cycling through ["Use Cases", "Business Value", "Data Strategy", "AI Insights"]
- Active word uses gradient `from-[#FF3621] to-[#FF8A6B]` with `bg-clip-text text-transparent`
- Blinking cursor after typed word
- Second line in muted color: "from your data."
- Subtitle: text-xl in secondary color, max 2 lines
- Primary CTA: red gradient button with shadow glow + arrow icon with hover shift
- Secondary text: "No setup required — runs on your Databricks workspace"
- Pipeline flow visualization below: 5 icon pills connected by chevrons (Scan → Generate → Score → Genie → Deliver)
- Check: hero occupies 70-80% of viewport, single primary CTA, no competing actions

**Section 3 — Ambient Background**
- Fixed position, z-0, pointer-events-none
- 3 large gradient blobs in Databricks red at very low opacity (6-8%)
- Each blob has different `blur` radius (80-120px) and pulse speed (8-12s)
- Creates aurora/nebula effect without distracting from content

**Section 4 — Infinite Scrolling Marquee**
- Oversized text (text-5xl) at 4% opacity
- Keywords: USE CASES, DOMAINS, SCORING, GENIE, PDF, EXCEL, NOTEBOOKS, STRATEGY, PRIORITY, AI, INSPIRE
- Diamond separator between words
- CSS `@keyframes marquee` at 40s linear infinite
- Full-width with `border-y border-white/5`
- Check: doesn't cause motion sickness, respect prefers-reduced-motion

**Section 5 — Industry Showcase (the scrollable section)**
This is the hero section. It must feel like a product demo:
- Heading: "What Inspire Generates" + "Real use cases. Every industry."
- Subtitle explaining the value
- Arrow buttons (left/right) on desktop
- **Filter pills** above the carousel — one per industry, horizontally scrollable, active state with red accent
- **Horizontal scroll container** with `snap-x snap-mandatory`
- **6 industry cards** (380-420px wide, snap-start):
  - Retail & E-Commerce (red accent)
  - Financial Services (blue accent)
  - Healthcare (green accent)
  - Manufacturing (yellow accent)
  - Telecom & IoT (purple accent)
  - Education (orange accent)
- Each card has:
  - Color-coded icon + industry name + "4 use cases generated"
  - Mini progress bars showing priority scoring
  - 4 use case items, each with:
    - Number badge
    - Use case title (realistic, Inspire-style: "Predict [X] with [Y] Strategy")
    - Priority badge (Ultra High / Very High / High) with appropriate color
    - Domain tag in muted text
  - Footer: "Generated by Inspire AI" + sparkle icon + "AI scored"
- Clicking a filter pill scrolls to that card
- Scroll position updates active pill
- Check: scroll snap works on mobile, touch swipe smooth, no jank

**Section 6 — Big Statement**
- Full-width, generous vertical padding (py-20)
- Two lines of oversized text (text-5xl to text-6xl):
  - Line 1 at 10% opacity: "Your data already has the answers."
  - Line 2 in red gradient: "Inspire finds the questions."
- Nothing else. Let the typography breathe.

**Section 7 — Stats Strip**
- Full-width `border-y` section with subtle bg tint
- 4 metrics in a grid (2x2 on mobile, 4x1 on desktop):
  - "100+" — Use Cases Per Run
  - "8" — Business Domains
  - "<30min" — End-to-End
  - "15+" — Languages
- Numbers: text-4xl font-extrabold with gradient text (white to white/60)
- Labels: text-xs uppercase tracking-wider in muted color

**Section 8 — Bento Feature Grid**
- Heading: "Capabilities" + "Everything you need to unlock data value"
- 4 cards in asymmetric 3-column grid:
  - **AI-Powered Discovery** (col-span-2) — BrainCircuit icon
  - **Domain Clustering** (col-span-1) — Layers icon
  - **Enterprise Grade** (col-span-1) — Shield icon
  - **Genie Code Instructions** (col-span-2) — Sparkles icon
- Each card: icon in tinted square + bold title + muted description
- Hover: subtle glow overlay from accent color + border shift
- Check: cards stack properly on mobile, consistent padding

**Section 9 — How It Works**
- Contained in a subtle card (`bg-white/[0.03] border rounded-2xl`)
- 3-column grid (stacks on mobile):
  - Step 01: "Point to Your Data" — Select catalogs from Unity Catalog
  - Step 02: "AI Generates Use Cases" — Foundation models analyze schema
  - Step 03: "Get Deliverables" — Use cases, Genie instructions, PDFs
- Step numbers in oversized ghost text (text-5xl at 4% opacity)
- Step title in bold white, description in muted

**Section 10 — Bottom CTA**
- Centered text: "Ready to discover what your data can do?"
- Subtitle in muted color
- Primary CTA button (same style as hero)
- This is the final conversion point — high contrast, no distractions

**Section 11 — Footer**
- Databricks logo + "Powered by Databricks"
- Tech tags: "Unity Catalog", "Foundation Models", "Genie"
- Minimal, quiet, doesn't compete with CTA above

### PHASE 4: QUALITY REVIEW

After building, review the complete page against the ui-ux-pro-max checklist:

1. **Accessibility audit:**
   - Run through all CRITICAL rules (contrast 4.5:1, focus states, keyboard nav, aria-labels)
   - Check all touch targets are 44x44 minimum
   - Verify heading hierarchy (h1 → h2 → h3, no skips)
   - Ensure color is never the only way to convey information

2. **Performance check:**
   - No external dependencies loaded
   - Images lazy loaded (if any)
   - CSS animations use transform/opacity only
   - No layout shift on load (CLS < 0.1)
   - Check bundle would stay under 100KB gzipped

3. **Responsive verification:**
   - Mentally test at 375px (iPhone SE), 768px (iPad), 1280px (laptop), 1440px (desktop)
   - Hero text scales down properly (text-5xl on mobile vs text-7xl on desktop)
   - Bento grid stacks to single column on mobile
   - Horizontal scroll is swipeable on touch devices
   - Filter pills wrap or scroll on small screens

4. **Animation audit:**
   - All transitions are 150-300ms
   - Hover effects use transform/opacity (not width/height)
   - Typing animation doesn't block interaction
   - Marquee respects prefers-reduced-motion
   - No more than 2 animated elements visible simultaneously

5. **Conversion review:**
   - Single clear CTA hierarchy (primary red button)
   - CTA appears at least 3 times (hero, after showcase, bottom)
   - No competing CTAs or confusing secondary actions
   - Social proof (industry showcase) comes before the bottom CTA
   - Value proposition clear within 3 seconds of landing

6. **Databricks brand check:**
   - Only Databricks Red as accent (no other brand colors)
   - Correct terminology: Unity Catalog, Foundation Models, Genie, Lakeflow
   - Professional, data-forward tone — not playful or casual
   - Logo displays correctly at all sizes

### PHASE 5: OUTPUT

Deliver:
1. The complete React component (single file, self-contained)
2. Any CSS keyframes needed (for marquee, etc.)
3. A design token summary I can reuse across other pages
4. A list of any trade-offs or decisions you made and why

### CONSTRAINTS

- **React + Tailwind CSS only.** No CSS-in-JS, no styled-components, no Sass.
- **lucide-react for all icons.** No other icon libraries.
- **No external animation libraries.** No Framer Motion, GSAP, Lottie. CSS only.
- **No external fonts to load.** Use system font stack: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif`
- **Mobile-first responsive.** Use `sm:`, `md:`, `lg:` Tailwind breakpoints.
- **Dark theme as default.** Background #09090B, surfaces #111113.
- **WCAG AA minimum.** All text contrast 4.5:1 against background.
- **Max component size:** Under 500 lines of JSX. If larger, split into sub-components in the same file.

### REFERENCE SITES FOR VISUAL QUALITY

Match or exceed the visual quality of:
- **linear.app** — Clean dark UI, subtle gradients, perfect spacing
- **vercel.com** — Bold typography, minimal, powerful CTAs
- **stripe.com** — Gradient accents, professional yet modern
- **raycast.com** — Glass effects, dark premium, developer-focused
- **plunderandpoach.webflow.io** — Bold product showcase, scrollable cards, oversized typography
