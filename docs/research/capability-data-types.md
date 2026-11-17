# Capability data types

Every one of the 439 console capabilities now declares the data type of each value it reports, so the row, the inspector and the agent brief draw it the way the type wants. Rate (Hz) is shown only for streams where it means something.

## Method

The levels follow Stevens (1946): nominal, ordinal, interval and ratio. Real device readings need a few more kinds that the four levels do not cover well: count, boolean, temporal, text, identifier, geo, set, media and color. Each capability metric was classified by hand from the field it reads, with a primary metric chosen as the headline. Reference capabilities (availability only) are ordinal: unsupported, prompt, granted.

## Kinds

| Kind | Level | Row shows | Detail shows | Never |
|---|---|---|---|---|
| Ratio | Quantitative, true zero | Number with unit (62 %, 25.8 Mbps) | Big number, sparkline and trend chart | Hz or a record count in place of the value |
| Interval | Quantitative, no true zero | Signed number with unit (-6 h, 181°) | Big number, sparkline; differences, not ratios | Percent change (meaningless without a true zero) |
| Count | Quantitative, whole numbers | Whole number with noun (11 devices) | Number, step chart over time | Decimals |
| Ordinal | Ordered categories | Chip with the current level | Chip plus the ordered scale with the current step marked | A number line or average |
| Nominal | Unordered categories | Chip with the value (America/Chicago) | Chip plus the known options | Hz, a count, or a chart |
| Boolean | Two states | Yes or No badge with an icon | Badge with icon and word; when it last changed | 1 or 0, true or false, a chart |
| Temporal | Point in time | Relative time (2 min ago) | Exact timestamp and time zone | Raw epoch milliseconds |
| Text | Free text | The text, shortened | Full text, copyable | Its length in place of the text |
| Identifier | Opaque key or hash | Short monospace value | Full value, copyable, stability note | A chart or a sum |
| Geo | Position | Latitude and longitude | Coordinates with accuracy radius | Separate lat and lon sparklines as the headline |
| Set | List of values | Count of items with the first few | Every item as a chip | Only the count when items are known |
| Media | Stream or blob | Live or captured, with size | The preview itself | Hz as the headline |
| Color | Color value | Swatch with hex | Swatch, hex and contrast | A number |

## Counts by primary type

| Type | Capabilities |
|---|---|
| ordinal | 308 |
| boolean | 29 |
| nominal | 28 |
| ratio | 26 |
| count | 26 |
| set | 9 |
| text | 7 |
| interval | 3 |
| color | 2 |
| geo | 1 |

## Counts across all declared metrics

| Type | Metrics |
|---|---|
| ordinal | 311 |
| count | 117 |
| ratio | 75 |
| boolean | 54 |
| nominal | 41 |
| set | 18 |
| interval | 12 |
| text | 10 |
| identifier | 2 |
| color | 2 |
| geo | 1 |

The full matrix (every capability, every metric, type, unit and options) is in `capability-data-types.json` next to this file.

## Layout research

- Apple Human Interface Guidelines, layout and split views: a list and detail pair collapses to a push stack on compact widths; Back returns to the list.
- Material 3 canonical layouts and window size classes: compact under 600dp, medium 600 to 839dp, expanded 840dp and up; list detail shows both panes only when expanded.
- WCAG 2.2 target size (2.5.8 minimum 24px; 2.5.5 enhanced 44px) and Apple HIG 44pt hit targets.

Applied: three columns at 1100px and up; a sheet over the list from 700 to 1099px; a full screen detail under 700px that the browser Back button closes; deep links open the detail over the capability list; 44px targets on coarse pointers; the voice dock docks below the inspector instead of covering it.

## Sources

- S. S. Stevens, On the Theory of Scales of Measurement, Science 103 (1946).
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://m3.material.io/foundations/layout/canonical-layouts/list-detail
- https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
