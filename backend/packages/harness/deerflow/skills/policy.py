"""Product-level skill visibility policy."""

HIDDEN_SKILL_NAMES = frozenset(
    {
        "chart-visualization",
        "claude-to-deerflow",
        "code-documentation",
        "data-analysis",
        "find-skills",
        "frontend-design",
        "github-deep-research",
        "image-generation",
        "newsletter-generation",
        "podcast-generation",
        "ppt-generation",
        "skill-creator",
        "surprise-me",
        "systematic-literature-review",
        "vercel-deploy",
        "video-generation",
        "web-design-guidelines",
    },
)


def is_hidden_skill_name(skill_name: str) -> bool:
    """Return whether a skill should be hidden and unavailable."""
    return skill_name in HIDDEN_SKILL_NAMES
