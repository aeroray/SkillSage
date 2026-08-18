use scraper::{Html, Selector};
use serde_json::Value;

use crate::error::SkillsageError;

use super::{
    client::StoreClient,
    models::{AuditEntry, SkillDetail},
    search::parse_count,
};

pub async fn fetch(client: &StoreClient, skill_id: &str) -> Result<SkillDetail, SkillsageError> {
    let path = StoreClient::detail_path(skill_id)?;
    let html = client.get_text(&path).await?;
    parse_detail(skill_id, &html)
}

fn parse_detail(skill_id: &str, html: &str) -> Result<SkillDetail, SkillsageError> {
    let document = Html::parse_document(html);
    let json_ld_selector = Selector::parse("script[type=\"application/ld+json\"]")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    let software = document
        .select(&json_ld_selector)
        .filter_map(|script| {
            let text = script.text().collect::<String>();
            serde_json::from_str::<Value>(&text).ok()
        })
        .find(|value| value.get("@type").and_then(Value::as_str) == Some("SoftwareApplication"))
        .ok_or_else(|| {
            SkillsageError::InvalidStoreData("skill detail JSON-LD is missing".into())
        })?;

    let parts: Vec<&str> = skill_id.split('/').collect();
    if parts.len() < 3 {
        return Err(SkillsageError::InvalidStoreData(
            "skill id does not contain a GitHub source and skill path".into(),
        ));
    }
    let slug = parts[2..].join("/");
    let source = parts[..2].join("/");
    let name = software
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(parts.last().copied().unwrap_or("skill"))
        .to_string();
    let description = software
        .get("description")
        .and_then(Value::as_str)
        .or_else(|| meta_description(&document))
        .unwrap_or("No description available.")
        .to_string();
    let installs = software
        .get("interactionStatistic")
        .and_then(|value| value.get("userInteractionCount"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let github_stars = parse_github_stars(&document)?;
    let audits = parse_audits(&document)?;

    Ok(SkillDetail {
        id: skill_id.to_string(),
        source,
        slug,
        name,
        description,
        license: None,
        installs,
        github_stars,
        url: format!("https://www.skills.sh/{skill_id}"),
        skill_path: None,
        audits,
        version: None,
        files: Vec::new(),
    })
}

fn meta_description<'a>(document: &'a Html) -> Option<&'a str> {
    let selector = Selector::parse("meta[name=description]").ok()?;
    document
        .select(&selector)
        .next()
        .and_then(|meta| meta.value().attr("content"))
}

fn parse_github_stars(document: &Html) -> Result<Option<u64>, SkillsageError> {
    let selector = Selector::parse("div[class*=bg-background]")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    for element in document.select(&selector) {
        let text = element.text().collect::<Vec<_>>().join(" ");
        if text.contains("GitHub Stars") && text.chars().count() < 160 {
            let count = text.split_whitespace().last().map(parse_count).unwrap_or(0);
            return Ok(Some(count));
        }
    }
    Ok(None)
}

fn parse_audits(document: &Html) -> Result<Vec<AuditEntry>, SkillsageError> {
    let selector = Selector::parse("a[href*=\"/security/\"]")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    let span_selector = Selector::parse("span")
        .map_err(|error| SkillsageError::InvalidStoreData(error.to_string()))?;
    Ok(document
        .select(&selector)
        .filter_map(|link| {
            let values: Vec<String> = link
                .select(&span_selector)
                .map(|span| span.text().collect::<String>().trim().to_string())
                .filter(|value| !value.is_empty())
                .collect();
            let provider = values.first()?.clone();
            let status = values.get(1)?.to_lowercase();
            let href = link.value().attr("href")?;
            let slug = href.rsplit('/').next()?.to_string();
            Some(AuditEntry {
                provider,
                slug,
                status,
                summary: String::new(),
                audited_at: None,
                risk_level: None,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::parse_detail;

    #[test]
    fn parses_detail_fields_from_skills_page_markup() {
        let html = r#"
            <script type="application/ld+json">
            {"@type":"SoftwareApplication","name":"react-skill","description":"React guidance","interactionStatistic":{"userInteractionCount":1234}}
            </script>
            <div class="bg-background py-8"><span>GitHub Stars</span><span>5.2K</span></div>
            <a href="/owner/repo/skill/security/socket"><span>Socket</span><span>Pass</span></a>
        "#;
        let detail = parse_detail("owner/repo/skill", html).expect("detail should parse");
        assert_eq!(detail.description, "React guidance");
        assert_eq!(detail.installs, 1234);
        assert_eq!(detail.github_stars, Some(5200));
        assert_eq!(detail.audits[0].status, "pass");
    }
}
