import { escapeHtml, renderMarkdown } from "./text.js";

export const WHY_TITLE = "While You're Busy Running Your Business, Who's Watching Out for You?";
export const WHY_DOCUMENT_TITLE = `${WHY_TITLE} · Walton County Business Leaders`;
export const WHY_DESCRIPTION =
  "You may not think you need a business advocacy group. That's exactly why you should know what we're doing.";
export const WHY_CANONICAL = "https://waltonleaders.org/why-we-exist";

export const WHY_ARTICLE_MARKDOWN = [
  "**You may not think you need a business advocacy group. That's exactly why you should know what we're doing.**",
  "",
  "You're busy. You have employees to manage, customers to serve, bills to pay, and a family to provide for. The last thing you have time to do is read county commission agendas, attend government meetings, or monitor every proposed ordinance.",
  "",
  "But here's the problem: **Local government doesn't stop making decisions just because you're busy.**",
  "",
  "A new business registration requirement. Another fee. A change in zoning. Additional licensing restrictions. New regulations that increase your operating costs.",
  "",
  "Individually, these changes might seem insignificant. But little by little, they add up. What was once simple becomes complicated. What was once affordable becomes expensive. And freedoms you took for granted can slowly become restricted.",
  "",
  "By the time most business owners discover what's changed, the public hearings are over, the votes have been counted, and the new rules are already in place.",
  "",
  "**Why wasn't anyone paying attention?**",
  "",
  "Because most business owners were doing exactly what they're supposed to be doing: working hard, creating jobs, serving customers, and supporting their families.",
  "",
  "That is precisely why Walton County Business Leaders exists.",
  "",
  "We're here to monitor local government proposals, identify policies affecting businesses, inform our community, and help ensure business owners have an opportunity to be heard before decisions become law.",
  "",
  "We believe government works best when the people affected by its decisions are informed and involved. Whether limited public awareness is intentional or simply the result of a complicated government process, the outcome can be the same: decisions get made without meaningful input from those who will live with the consequences.",
  "",
  "**You shouldn't have to become a government watchdog just to run your business.**",
  "",
  "That's why we're building a network of people who understand what's at stake.",
  "",
  "Because the time to speak up isn't after a new regulation takes effect.",
  "",
  "**It's before the vote.**",
  "",
  "**Walton County Business Leaders**",
  "",
  "*A Unified Voice for Walton County's Business Community.*",
].join("\n");

const SIGNATURE = "<p><strong>Walton County Business Leaders</strong></p>";
const SIGNATURE_LINK =
  '<p><strong><a href="https://waltonleaders.org/">Walton County Business Leaders</a></strong></p>';

export function renderWhyArticleBody(markdown = WHY_ARTICLE_MARKDOWN) {
  const html = renderMarkdown(markdown);
  if (!html.includes(SIGNATURE)) return html;
  return html.replace(SIGNATURE, SIGNATURE_LINK);
}

const ARTICLE_CSS = `
      .article-copy > .eyebrow {
        font-size: 10px;
        letter-spacing: 1.6px;
        line-height: 1.5;
        font-weight: 600;
        text-transform: uppercase;
      }
      .article-copy > .eyebrow::before {
        content: "";
        display: inline-block;
        width: 34px;
        height: 2px;
        background: var(--gold);
        vertical-align: middle;
        margin-right: 15px;
      }
      .article-copy .prose p {
        margin: 0 0 18px;
        font-size: 18px;
        line-height: 1.6;
      }
      .article-copy .prose a {
        text-decoration: underline;
        text-decoration-color: var(--gold);
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
      }
      .article-cta { margin: 36px 0 0; }
      @media (min-width: 801px) {
        .article-copy > .eyebrow {
          letter-spacing: 2.4px;
          font-size: 12px;
        }
        .article-copy .prose p { font-size: 19px; }
      }
`;

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

export function renderWhyWeExistPage(joinHtml) {
  const joinTitle = "Request membership · Walton County Business Leaders";
  const joinDescription =
    "Request membership in Walton County Business Leaders. Membership is free and applications are reviewed before anyone is added.";
  let page = String(joinHtml ?? "");
  if (count(page, joinTitle) !== 3) throw new Error("join title shell changed");
  if (count(page, joinDescription) !== 3) throw new Error("join description shell changed");
  if (count(page, "https://waltonleaders.org/join") !== 2) throw new Error("join canonical shell changed");
  if (count(page, 'href="#apply"') !== 1) throw new Error("join skip link changed");
  if (count(page, '<main id="apply">') !== 1) throw new Error("join main changed");
  if (count(page, "</style>") !== 1) throw new Error("join style shell changed");

  const body = renderWhyArticleBody();
  if (!body.includes(SIGNATURE_LINK)) throw new Error("closing site link missing");
  if (body.includes("waltoncountybusinessleaders.org")) throw new Error("unexpected organization domain");
  if (/[—–]/.test(body) || /[—–]/.test(WHY_TITLE) || /[—–]/.test(WHY_DESCRIPTION)) {
    throw new Error("article copy contains an em or en dash");
  }

  const main = `<main id="why-we-exist">
      <article class="container apply">
        <div class="apply-copy article-copy">
          <p class="eyebrow">WHY WE EXIST</p>
          <h1>${escapeHtml(WHY_TITLE)}</h1>
          <div class="prose">
            ${body}
          </div>
          <p class="article-cta"><a class="button" href="/join">Join Walton County Business Leaders</a></p>
        </div>
      </article>
    </main>`;

  page = page.split(joinTitle).join(escapeHtml(WHY_DOCUMENT_TITLE));
  page = page.split(joinDescription).join(escapeHtml(WHY_DESCRIPTION));
  page = page.split("https://waltonleaders.org/join").join(WHY_CANONICAL);
  page = page.replace(/<main id="apply">[\s\S]*?<\/main>/, main);
  page = page.replace('href="#apply"', 'href="#why-we-exist"');
  page = page.replace("</style>", `${ARTICLE_CSS}    </style>`);
  return page;
}
