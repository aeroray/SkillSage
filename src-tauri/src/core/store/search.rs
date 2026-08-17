use std::collections::HashSet;

use scraper::{Html, Selector};

use crate::error::SkillsageError;

use super::{
    client::StoreClient,
    models::{LeaderboardRange, LegacySearchResponse, SkillSearchResult},
};

pub async fn fetch(
    client: &StoreClient,
    query: &str,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    if query.trim().chars().count() < 2 {
        return Ok(Vec::new());
    }
    let response: LegacySearchResponse = client
        .get_json("/api/search", &[("q", query.trim())])
        .await?;
    Ok(response
        .skills
        .into_iter()
        .map(|skill| SkillSearchResult {
            id: skill.id.clone(),
            slug: skill.skill_id,
            name: skill.name,
            source: skill.source.clone(),
            installs: skill.installs,
            source_type: "github".to_string(),
            install_url: Some(format!("https://github.com/{}", skill.source)),
            url: format!("https://www.skills.sh/{}", skill.id),
            is_duplicate: false,
        })
        .collect())
}

pub async fn fetch_leaderboard(
    client: &StoreClient,
    range: LeaderboardRange,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let html = client.get_text(range.path()).await?;
    parse_leaderboard(&html)
}

fn parse_leaderboard(html: &str) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let document = Html::parse_document(html);
    let link_selector = Selector::parse("a[href]")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    let heading_selector = Selector::parse("h3")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    let source_selector = Selector::parse("p")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    let mut seen = HashSet::new();
    let mut skills = Vec::new();

    for link in document.select(&link_selector) {
        let Some(href) = link.value().attr("href") else {
            continue;
        };
        let parts: Vec<&str> = href.trim_matches('/').split('/').collect();
        if !href.starts_with('/') || parts.len() < 3 {
            continue;
        }
        let Some(name) = link
            .select(&heading_selector)
            .next()
            .map(|heading| heading.text().collect::<String>().trim().to_string())
        else {
            continue;
        };
        let source = link
            .select(&source_selector)
            .next()
            .map(|source| source.text().collect::<String>().trim().to_string())
            .filter(|source| !source.is_empty())
            .unwrap_or_else(|| parts[..2].join("/"));
        let id = parts.join("/");
        if !seen.insert(id.clone()) {
            continue;
        }
        let slug = parts[2..].join("/");
        let text = link.text().collect::<Vec<_>>().join(" ");
        skills.push(SkillSearchResult {
            id: id.clone(),
            slug,
            name,
            source: source.clone(),
            installs: parse_count(text.split_whitespace().last().unwrap_or_default()),
            source_type: "github".to_string(),
            install_url: Some(format!("https://github.com/{source}")),
            url: format!("https://www.skills.sh/{id}"),
            is_duplicate: false,
        });
    }

    if skills.is_empty() {
        return Err(SkillsageError::InvalidStoreData(
            "skills.sh leaderboard markup did not contain skill rows".into(),
        ));
    }
    Ok(skills)
}

pub(crate) fn parse_count(value: &str) -> u64 {
    let normalized = value.trim().replace(',', "");
    let (number, multiplier) = match normalized.chars().last() {
        Some('M') | Some('m') => (&normalized[..normalized.len() - 1], 1_000_000.0),
        Some('K') | Some('k') => (&normalized[..normalized.len() - 1], 1_000.0),
        _ => (normalized.as_str(), 1.0),
    };
    number
        .parse::<f64>()
        .map(|value| (value * multiplier) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::parse_count;

    #[test]
    fn parses_compact_install_counts() {
        assert_eq!(parse_count("3.0M"), 3_000_000);
        assert_eq!(parse_count("880.0K"), 880_000);
        assert_eq!(parse_count("12,345"), 12_345);
    }
}
