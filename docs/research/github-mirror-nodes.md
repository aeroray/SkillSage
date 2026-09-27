# GitHub.akams.cn Proxy Node Report

**Target site:** https://github.akams.cn/ (hubp.org / [ghproxy-next](https://github.com/hubporg/ghproxy-next))
**Test asset:** `<node>/https://github.com/aeroray/SkillSage/releases/latest/download/latest.json`
**Direct baseline:** HTTP 200, valid JSON with `"version": "1.0.2"` (~4.4 KB)

---

## (a) The node-list API URL — **there is no API**

The premise of the task (a client-side API fetch) turned out to be false. **The node list is hardcoded in the JS bundle; no network request is made to build it.**

The `"加载节点列表中..."` string is a *loading state*, not evidence of a fetch. The initializer is:

```js
// /_next/static/chunks/8299e6a463d503ae.js
let j=[{label:"contribute",value:"gh.dpik.top"},{label:"contribute",value:"github.tbap.top"}, ... ];

async function e_(){
  try{
    V(!0);                                  // V = setLoading(true)  -> shows "加载节点列表中..."
    let e=ek(), t=ew(), n=Date.now(),
        l=j.map(l=>{                        // <-- maps the STATIC array, no fetch()
          let r=e[l.value], a=t[l.value], i="-";
          return r&&n-r.timestamp<$.LATENCY_CACHE_DURATION&&(i=r.value),
                 {...l,latency:i,speed:a||"-"};
        }),
        r=eh(l);
    return M(r), V(!1), r
  }catch(n){
    console.error("初始化节点列表失败:",n);
    ...
  }finally{ V(!1) }
}
```

`e_()` only reads two `localStorage` caches (`node_latency_cache`, `node_speed_cache`) and merges them onto the constant `j`. The only `fetch()` calls in the whole bundle are Waline comments, Giphy, GitHub Releases (`api.github.com`), and the *latency/speed probes* (`https://${node}/${path}?t=...`).

### Candidate endpoints — all confirmed non-existent

| Candidate URL | Result |
|---|---|
| `https://github.akams.cn/api/nodes` | **404** |
| `https://github.akams.cn/api/list` | **404** |
| `https://github.akams.cn/api/proxy` | **404** |
| `https://github.akams.cn/api/nodes/list` | **404** |
| `https://github.akams.cn/api/health` | **404** |
| `https://github.akams.cn/api/speed` | **404** |
| `https://github.akams.cn/nodes.json` | **404** |
| `https://github.akams.cn/nodes` | **404** |
| `https://api.akams.cn/nodes` | **502** |

### The authoritative source (what you actually want)

The bundle array is generated from this file in the repo, and the two are **byte-identical in order and content** (verified: 80 = 80, 49 `contribute` + 31 `search`, zero diff):

```
https://raw.githubusercontent.com/hubporg/ghproxy-next/main/components/nodes.ts
```

A GitHub Action (`.github/workflows/contribute-node.yml`) appends new nodes to `nodes.ts` when a `contribute-node` issue is opened and the domain passes an HTTPS connectivity check. That is the only update mechanism — so `nodes.ts` on `main` is the live, canonical list.

---

## (b) All 80 proxy node base URLs

Base URL form is `https://<node>`. Label is the site's own classification (`contribute` = 贡献, `search` = 测绘).

| # | Node base URL | Label | 2-attempt status | 2-attempt times | Best ms | Re-test (5×) |
|---|---|---|---|---|---|---|
| 1 | `https://gh.catmak.name` | contribute | 200/200 | 1578ms / 194ms | **194** | 5/5 (med 193ms) |
| 2 | `https://githubdog.com` | contribute | 200/200 | 800ms / 209ms | **209** | 5/5 (med 212ms) |
| 3 | `https://g.blfrp.cn` | search | 200/200 | 1063ms / 224ms | **224** | 5/5 (med 5093ms) |
| 4 | `https://cdn.akaere.online` | contribute | 200/200 | 1179ms / 227ms | **227** | 5/5 (med 239ms) |
| 5 | `https://fastgit.cc` | search | 200/200 | 1152ms / 231ms | **231** | 5/5 (med 236ms) |
| 6 | `https://gh-proxy.com` | contribute | 200/200 | 1348ms / 257ms | **257** | 5/5 (med 460ms) |
| 7 | `https://github.geekery.cn` | search | 200/200 | 1103ms / 283ms | **283** | 5/5 (med 278ms) |
| 8 | `https://github.chenc.dev` | search | 200/200 | 1487ms / 305ms | **305** | 5/5 (med 297ms) |
| 9 | `https://cdn.gh-proxy.com` | contribute | 200/200 | 1070ms / 317ms | **317** | 5/5 (med 341ms) |
| 10 | `https://gh.acmsz.top` | contribute | 200/200 | 1521ms / 334ms | **334** | 5/5 (med 326ms) |
| 11 | `https://gh.inkchills.cn` | contribute | 200/200 | 1198ms / 336ms | **336** | 5/5 (med 328ms) |
| 12 | `https://ghp.keleyaa.com` | search | 200/200 | 1497ms / 336ms | **336** | 5/5 (med 619ms) |
| 13 | `https://gh.927223.xyz` | contribute | 200/200 | 1694ms / 337ms | **337** | 5/5 (med 496ms) |
| 14 | `https://gh.jjj.gv.uy` | contribute | 200/200 | 1736ms / 344ms | **344** | 5/5 (med 1096ms) |
| 15 | `https://github.dpik.top` | contribute | 200/200 | 1939ms / 345ms | **345** | 5/5 (med 331ms) |
| 16 | `https://github.tbap.top` | contribute | 200/200 | 805ms / 374ms | **374** | 5/5 (med 382ms) |
| 17 | `https://gh.dpik.top` | contribute | 200/200 | 779ms / 401ms | **401** | 5/5 (med 422ms) |
| 18 | `https://gitproxy.mrhjx.cn` | search | 200/200 | 1382ms / 401ms | **401** | 5/5 (med 434ms) |
| 19 | `https://git.yylx.win` | contribute | 200/200 | 1637ms / 416ms | **416** | 5/5 (med 4045ms) |
| 20 | `https://github.mxw.qzz.io` | contribute | 200/200 | 2799ms / 421ms | **421** | — |
| 21 | `https://ghproxy.imciel.com` | search | 200/200 | 1425ms / 423ms | **423** | — |
| 22 | `https://down.mxw.xx.kg` | contribute | 200/200 | 2037ms / 425ms | **425** | — |
| 23 | `https://ghproxy.cxkpro.top` | search | 200/200 | 1509ms / 432ms | **432** | — |
| 24 | `https://ghpxy.hwinzniej.top` | search | 200/200 | 1670ms / 458ms | **458** | — |
| 25 | `https://gh.chjina.com` | search | 200/200 | 1546ms / 467ms | **467** | — |
| 26 | `https://ghfile.geekertao.top` | contribute | 200/200 | 1918ms / 475ms | **475** | — |
| 27 | `https://gh.monlor.com` | search | 200/200 | 1648ms / 496ms | **496** | — |
| 28 | `https://gh.ddlc.top` | search | 200/200 | 1810ms / 508ms | **508** | — |
| 29 | `https://xsadwsd.kdns.fr` | contribute | 200/200 | 1807ms / 525ms | **525** | — |
| 30 | `https://gh.meali.top` | contribute | 200/200 | 1946ms / 526ms | **526** | — |
| 31 | `https://ghproxy.net` | contribute | 200/200 | 1417ms / 548ms | **548** | 5/5 (med 736ms) |
| 32 | `https://js.jiangss.shop` | contribute | 200/200 | 1532ms / 590ms | **590** | — |
| 33 | `https://ghf.无名氏.top` | contribute | 200/200 | 1828ms / 594ms | **594** | — |
| 34 | `https://cfgh.ikgy.top` | contribute | 200/200 | 1673ms / 687ms | **687** | — |
| 35 | `https://gh.07150721.xyz` | contribute | 200/200 | 1779ms / 700ms | **700** | — |
| 36 | `https://gh.noki.icu` | search | 200/200 | 1235ms / 762ms | **762** | — |
| 37 | `https://ghproxy.felicity.land` | contribute | 200/200 | 1921ms / 763ms | **763** | — |
| 38 | `https://github-proxy.memory-echoes.cn` | contribute | 200/200 | 2349ms / 774ms | **774** | — |
| 39 | `https://down.mxw.qzz.io` | contribute | 200/200 | 14092ms / 808ms | **808** | — |
| 40 | `https://free.cn.eu.org` | search | 200/200 | 2592ms / 882ms | **882** | — |
| 41 | `https://github.ednovas.xyz` | search | 200/200 | 6512ms / 914ms | **914** | — |
| 42 | `https://github.ikgy.top` | contribute | 200/200 | 1829ms / 1234ms | **1234** | — |
| 43 | `https://gh.sixyin.com` | search | 200/200 | 1643ms / 1312ms | **1312** | — |
| 44 | `https://github.gohj99.site` | contribute | 200/200 | 3507ms / 1788ms | **1788** | — |
| 45 | `https://githubproxy.gohj99.site` | contribute | 200/200 | 3455ms / 1981ms | **1981** | — |
| 46 | `https://proxy.yaoyaoling.net` | search | 200/200 | 19101ms / 16958ms | **16958** | — |

**46 / 80 nodes served a valid manifest.**

### Nodes that did NOT serve a valid manifest (34)

| # | Node base URL | Label | Status | Time | Reason |
|---|---|---|---|---|---|
| 1 | `https://ghm.078465.xyz` | contribute | ERR/ERR | 99ms / 15ms | DNS/connection failure |
| 2 | `https://github.starrlzy.cn` | contribute | ERR/ERR | 105ms / 26ms | DNS/connection failure |
| 3 | `https://j.1lin.dpdns.org` | contribute | ERR/ERR | 77ms / 233ms | DNS/connection failure |
| 4 | `https://gh.felicity.ac.cn` | contribute | 429/429 | 301ms / 226ms | Cloudflare rate-limit page |
| 5 | `https://gh.bugdey.us.kg` | contribute | ERR/ERR | 16ms / 1ms | DNS/connection failure |
| 6 | `https://j.1win.ggff.net` | contribute | ERR/ERR | 16ms / 21ms | DNS/connection failure |
| 7 | `https://jiashu.1win.eu.org` | contribute | 403/403 | 785ms / 196ms | `{"error":"访问被拒绝",...}` — path not allowed |
| 8 | `https://gh.b52m.cn` | contribute | ERR/ERR | 87ms / 30ms | DNS/connection failure |
| 9 | `https://tvv.tw` | contribute | 502/502 | 1152ms / 234ms | `Upstream request failed: undefined` |
| 10 | `https://gitproxy.127731.xyz` | contribute | 526/526 | 1126ms / 551ms | Cloudflare SSL 526 |
| 11 | `https://gh.tryxd.cn` | search | 200/200 | 390ms / 135ms | returns SPA HTML, not proxy output |
| 12 | `https://github.tmby.shop` | search | ERR/ERR | 995ms / 298ms | DNS/connection failure |
| 13 | `https://gitproxy.click` | search | 200/200 | 911ms / 210ms | JS redirect stub, no content |
| 14 | `https://slink.ltd` | search | 404/404 | 1232ms / 827ms | 404 Not Found |
| 15 | `https://gh.jasonzeng.dev` | search | ERR/ERR | 427ms / 213ms | DNS/connection failure |
| 16 | `https://gp.zkitefly.eu.org` | search | ERR/ERR | 11ms / 1ms | DNS/connection failure |
| 17 | `https://ghpr.cc` | search | 404/404 | 1876ms / 983ms | 404 Not Found |
| 18 | `https://git.669966.xyz` | search | 502/502 | 1199ms / 385ms | Cloudflare 502 |
| 19 | `https://ghp.arslantu.xyz` | search | 525/525 | 1309ms / 483ms | Cloudflare SSL 525 |
| 20 | `https://gh.idayer.com` | search | 429/429 | 736ms / 195ms | Cloudflare rate-limit page |
| 21 | `https://github.xxlab.tech` | search | 502/502 | 613ms / 436ms | 502 Bad Gateway |
| 22 | `https://ghproxy.monkeyray.net` | search | 404/404 | 906ms / 89ms | nginx 404 |
| 23 | `https://777.z321.cc.cd` | contribute | ERR/ERR | 210ms / 199ms | DNS/connection failure |
| 24 | `https://gap.andyjin.website` | contribute | ERR/ERR | 10ms / 1ms | DNS/connection failure |
| 25 | `https://gg.z321.cc.cd` | contribute | ERR/ERR | 311ms / 373ms | DNS/connection failure |
| 26 | `https://g.z321.cc.cd` | contribute | ERR/ERR | 515ms / 220ms | DNS/connection failure |
| 27 | `https://gh.my-website.ccwu.cc` | contribute | ERR/ERR | 715ms / 314ms | DNS/connection failure |
| 28 | `https://gh.ruan.dpdns.org` | contribute | 404/404 | 777ms / 333ms | `{"error":"Not Found"}` |
| 29 | `https://gh.qfmc0721.cc.cd` | contribute | ERR/ERR | 523ms / 214ms | DNS/connection failure |
| 30 | `https://ghfast.top` | search | ERR/ERR | 10209ms / 10611ms | timeout (10s connect fail) |
| 31 | `https://gh.zhai.edu.pl` | contribute | ERR/ERR | 10506ms / 10595ms | timeout (10s connect fail) |
| 32 | `https://github.nswrz.cn` | contribute | ERR/ERR | 10573ms / 10596ms | timeout (10s connect fail) |
| 33 | `https://ghproxy.1888866.xyz` | search | 522/522 | 20840ms / 19695ms | Cloudflare 522 (connection timed out) |
| 34 | `https://github-cf.947563.xyz` | contribute | 522/522 | 20755ms / 19667ms | Cloudflare 522 (connection timed out) |

Notably absent from this list: `https://ghfast.top`, `https://github.moeyy.xyz` and `https://ghproxy.net`-style well-known mirrors. `ghfast.top` **is** in the list but is currently dead (10s connect timeout, both attempts). `github.moeyy.xyz` is **not** in this site's list at all — it is a different service.

---

## (c) Validity verdict per node

Covered by the two tables above. Summary:

- **46 nodes** returned HTTP 200 with a parseable JSON body containing `"version": "1.0.2"` — valid manifest.
- **34 nodes** failed: 14 connection/DNS errors, 8 Cloudflare error pages (429/522/525/526/502), 5 hard 404s, 2 timeouts, 2 returned non-proxy HTML, 1 path-restriction 403, 1 upstream 502.
- Raw evidence — every valid response had this exact shape and byte length:

```
status: 200
bytes: 4368
body: { "version": "1.0.2", "notes": "## What's New · 本次更新\n\n### 🎉 技能来源与安装 · Skill Sources & Installation\n\n- 修复技能名称与 G...
```

### On timing methodology

Timing **was** measurable — I used Node's `fetch` with `process.hrtime.bigint()` and `redirect: 'follow'`, not `web_fetch` (which does not report timing). Two caveats on the numbers:

1. **Attempt 1 is consistently inflated** (e.g. `gh.catmak.name` 1578ms → 194ms; `down.mxw.qzz.io` 14092ms → 808ms). The first request to each host pays cold DNS + TCP + TLS. This is why attempt 2 is the meaningful one and why I re-ran the leaders 5× to confirm.
2. `proxy.yaoyaoling.net` "succeeded" at ~17s — it returns the manifest, but far too slowly to be usable. Treat it as failed in practice.

---

## (d) Recommended top 5 (fastest + most reliable, in order)

Ranked by the 5-attempt confirmation run (reliability first, then median latency):

| Rank | Node base URL | Success | Median | Best |
|---|---|---|---|---|
| 🥇 1 | `https://gh.catmak.name` | 5/5 | **193 ms** | 189 ms |
| 🥈 2 | `https://githubdog.com` | 5/5 | **212 ms** | 206 ms |
| 🥉 3 | `https://fastgit.cc` | 5/5 | **236 ms** | 223 ms |
| 4 | `https://cdn.akaere.online` | 5/5 | **239 ms** | 220 ms |
| 5 | `https://github.geekery.cn` | 5/5 | **278 ms** | 246 ms |

**Runners-up (also 5/5, use as failover):** `https://github.chenc.dev` (med 297ms), `https://gh.acmsz.top` (med 326ms), `https://gh.inkchills.cn` (med 328ms), `https://github.dpik.top` (med 331ms), `https://cdn.gh-proxy.com` (med 341ms).

**Use with caution despite low best-time:** `https://g.blfrp.cn` (best 224ms but median 5093ms — wildly inconsistent), `https://gh.jjj.gv.uy` (median 1096ms), `https://git.yylx.win` (median 4045ms).

**Well-known but NOT in the top tier here:** `https://gh-proxy.com` (best 257ms, median 460ms), `https://ghproxy.net` (median 736ms).

### Suggested failover chain

```
gh.catmak.name → githubdog.com → fastgit.cc → cdn.akaere.online → github.geekery.cn → cdn.gh-proxy.com
```

Usage: `https://<node>/https://github.com/<owner>/<repo>/releases/latest/download/<asset>`
