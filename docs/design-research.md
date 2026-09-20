# Cove design research

Reviewed September 12, 2026. This is a curated set of 25 relevant product and creative website references, not a claim that an objective ranking identifies these as the world's best layouts. All 25 primary homepages were retrieved using the web tool and inspected as rendered desktop first viewports in the in app browser. This is a focused composition study, not an accessibility audit, performance benchmark, complete interaction review, or endorsement of the products.

Some pages use entrance animation. The Pitch and Craft captures showed text partway through its entrance; Raycast's first viewport was a sparse headline state. Figma and Slack had cookie panels partially covering the viewport. Observations below are limited to what was visible and the retrieved page structure. No external screenshots, brand artwork, customer logos, testimonials, product claims, or source code were copied into Cove.

| Reference | Observed composition | Lesson applied to Cove |
| :--- | :--- | :--- |
| [Linear](https://linear.app/) | Dark restrained navigation, oversized left aligned headline, spacious opening, product interface entering below. | Give one clear thought visual priority and show an actual project document after the opening. |
| [Raycast](https://www.raycast.com/) | Dark canvas, centered headline with large surrounding space, a contained navigation rail. | A strong silhouette can carry energy without adding widgets. Cove keeps the hero edited and uses one sculptural asset. |
| [Stripe](https://stripe.com/) | Oversized opening statement, a colorful sweeping field from the right, and obvious primary action. | Use a directional image as a compositional counterweight while preserving text contrast. Use Cove's own ocean ribbon and colors. |
| [Vercel](https://vercel.com/) | Black canvas, simple center brand geometry, left action group, short right explanatory text. | Make the central brand idea recognizable with very few elements. Avoid manufacturing product data to fill the page. |
| [Framer](https://www.framer.com/) | Large left headline and two actions above one substantial product media area. | Use a single purposeful product frame instead of a collage of competing feature cards. |
| [Figma](https://www.figma.com/) | Narrow expressive type column beside a stack of colorful product examples. Cookie notice partly obscured the right side. | Vary text and media proportions to give the page character. Cove uses one example, avoiding unnecessary collage. |
| [Notion](https://www.notion.com/) | Very large centered statement, one vivid accent, clear actions, document preview immediately below. | Make the destination feel tangible. Cove's example is explicitly labeled and uses real context fields. |
| [Are.na](https://www.are.na/) | Sparse editorial text column on black, simple list structure, modest sign up controls. | Explain the product in plain language. Structure itself can be expressive; every section need not be a card. |
| [Pitch](https://pitch.com/) | Saturated purple field, lime signup contrast, a prominent prompt interaction. Text was mid animation. | Use a controlled high contrast accent consistently. Do not add a prompt box to Cove because the app does not generate context. |
| [Webflow](https://webflow.com/) | Large left headline, blue primary action, dark field and a lower gallery of varied product imagery. | A decisive headline and action can anchor a more energetic lower composition. Cove uses its own simpler workflow. |
| [Superhuman](https://superhuman.com/) | Split hero, left outcome and product choices, right enlarged interface detail. | Keep product content readable enough to understand the action. Cove's document and handoff remain larger than decorative chrome. |
| [Arc](https://arc.net/) | Vivid textured blue framing, central product transition message, distinctive border and large product image. | Repeated brand motifs provide personality. Cove repeats a restrained current curve instead of copying Arc's scalloped border. |
| [Airtable](https://www.airtable.com/) | Centered concise statement and actions, large warm product demonstration panel below. | Separate the offer from the product demonstration with clear space and a change of surface. |
| [Dropbox](https://www.dropbox.com/) | Readable left copy and strong action, right file workspace image, quiet neutral backdrop. | Explain a familiar user job and put the relevant interface nearby. Cove centers saved project context. |
| [Miro](https://miro.com/) | Centered headline and compact signup interaction over a subtle canvas texture. | Keep the entry action easy to find. Cove uses an explicit workspace button rather than an unnecessary homepage form. |
| [Resend](https://resend.com/) | Dark atmospheric background, expressive large serif heading and compact action pair. | One typography decision and subtle atmosphere can distinguish a technical product. Cove retains its coherent clean sans family. |
| [Mercury](https://mercury.com/) | Immersive landscape image with a desk, centered offer and compact conversion control. | Use an evocative image to connect utility with a feeling. Cove's abstract current expresses continuity without financial imagery. |
| [Ramp](https://ramp.com/) | Oversized left statement, bright yellow green action, pale patterned surface, product frame entering below. | A disciplined bright action color can make a practical interface feel lively. Reserve lime mainly for principal actions. |
| [Intercom](https://www.intercom.com/) | Spacious centered statement with photography fragments at the edges and a small central conversion form. | Protect the reading path even with expressive media. Cove keeps its ribbon away from essential text. |
| [Loom](https://www.loom.com/) | Large centered benefit statement, clear blue action, substantial media panel below. | Explain the handoff outcome before showing mechanics. Do not substitute a decorative video button for a working interaction. |
| [ClickUp](https://clickup.com/) | Large left statement with a strong first sentence and lighter continuation; interface preview under it. | Weight and contrast establish reading order. Cove gives its short headline priority over supporting explanation. |
| [Slack](https://slack.com/) | Centered large headline, purple action pair, product preview. Cookie banner covered the lower viewport. | Repeat one accent across key actions, and avoid overlays that hide the first task. Do not borrow their customer proof. |
| [Craft](https://www.craft.do/) | Broad soft blue scenic surface, floating compact navigation and editorial heading; capture mid entrance. | A cohesive atmosphere can make a document tool feel personal. Cove uses a sharper ocean identity and stable readable text. |
| [Things](https://culturedcode.com/things/) | Quiet narrow navigation, large recognizable icon, centered name and focused explanatory copy. | Confidence can come from simplicity. Cove's small custom wave mark should remain legible at application scale. |
| [Readwise](https://readwise.io/) | Editorial headline and highlight accent above a large desktop and mobile reading example. | Show the saved material itself. Cove's goals, decisions and next steps should be readable, not replaced by abstract dashboards. |

## Selected direction

The visual theme is continuity through an ocean current. The homepage begins with a deep navy field and an original cyan flowing ribbon, with acid lime principal actions. White document surfaces make the workspace easier to read. The same typography, thin rules, clean buttons and curve motif connect the public site to the application.

The homepage hierarchy is a brief promise and workspace entry, a tangible project example, three numbered workflow rows, and a final invitation. The workspace hierarchy is project identity, context editing and handoff actions, document tabs, clear content sections, and a small contextual handoff rail. There is no invented analytics dashboard, testimonial block, customer count or generic card grid.

| Token | Intended value |
| :--- | :--- |
| Main navy | `#071C2C` |
| Cyan highlight | `#5FE2EB` |
| Lime principal action | `#D6F96B` |
| Document surface | `#FFFFFF` |
| Font character | Clean expressive sans, Manrope style |
| Desktop content gutter | Approximately 48 to 72 px |
| Control radius | Approximately 8 to 12 px |
| Separation | Thin rules and whitespace, few containers |

## Original design deliverables

[Homepage concept](design/homepage-concept.png) establishes the complete compact public page. [Workspace concept](design/workspace-concept.png) establishes the primary document screen. [Production flow artwork](../apps/web/public/cove-flow.png) is the separate image asset. These are original design assets for this project. Interface text, buttons, navigation and document content should be implemented as native HTML, not as image slices.

The workspace concept added the small tagline “A deeper working memory” and the statement “Only you can see this.” Those are not accepted product claims. Omit the tagline and use privacy language consistent with actual access rules. The example data is synthetic, and homepage examples must remain explicitly identified. Final storage, sign in and assistant connection copy must reflect the Sites adaptation that is actually delivered.

The concepts are implementation references, not proof that the final application matches them. The final rendered desktop and mobile application must be inspected separately. Respect reduced motion, preserve keyboard focus, and keep all essential copy visible without waiting for animation.
