# Deck visuals (Executive Briefing)

Optimized full-bleed images of the **Mirage Suite Executive Briefing** (15 slides), extracted from [management/Mirage_Suite_Deck.pptx](../../management/Mirage_Suite_Deck.pptx).

## vs product screenshots

| Folder | Contents | Use |
| --- | --- | --- |
| **`assets/deck/slides/`** | Briefing artwork (diagrams, mocks, photography) | Docs embeds, visual catalog, executive briefing |
| **`assets/screenshots/`** | Captures from the **working** Mirage UI | Product proof — not deck mockups |

Slide 9 and tool thumbnails on slide 10 are **target / illustrative UI**, not current MVP screenshots.

## Regenerate

```bash
./Docs/assets/deck/extract-deck-slides.sh
```

Produces `slides/slide-01.jpg` … `slide-15.jpg` (max width 1920, JPEG ~80).

## Related Docs

- [visual-catalog.md](../../management/visual-catalog.md) — region-by-region inventory  
- [executive-briefing.md](../../management/executive-briefing.md) — talk track with embeds  
- [Mirage_Suite_Deck.pdf](../../management/Mirage_Suite_Deck.pdf) — present-mode master  
