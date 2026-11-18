// Standing copy for the signed-in hub. Priorities and taglines are the
// public homepage text for each network. Do not invent new ones.

export const HERO_PHOTO = "/assets/hub-hero.jpg";
export const HERO_LINE = "We're a brand new organization, working hard to reach our first 500 members. Thanks for being one of them.";

export const ACTION_COPY = {
  flagTitle: "Flag an Issue",
  inviteTitle: "Invite others",
  inviteBody: "Know someone who belongs here? Send them our join page.",
  socialTitle: "Join us on social",
  socialBody: "Follow the conversation with other members.",
  appTitle: "Get the app",
  appBody: "Add the member hub to your home screen for one-tap access.",
  flagLink: "Flag an issue",
};

export const IDEA_COPY = {
  headline: "Advocacy is just the start.",
  line: "As an early member, you can help steer this group's direction. Is there anything else you think we should become?",
  placeholder: "Share your idea",
  button: "Share your idea",
  thanks: "Thanks, we read every idea.",
};

const BUSINESS_NOTE = "An organized voice. Constructive dialogue. A stronger Walton County.";
const BUILDERS_NOTE = "An organized voice. Constructive dialogue. A stronger Walton County.";
const TOURISM_NOTE = "An organized voice. Practical positions. A stronger Walton County.";

export const HUB_PRIORITIES = {
  business: {
    note: BUSINESS_NOTE,
    tagline: "A Stronger Voice. A Stronger Business Community. A Stronger Walton County.",
    items: [
      ["Business-Friendly Policies", "Advocate for fair, reasonable, and transparent policies that encourage entrepreneurship, economic opportunity, business investment, and job creation."],
      ["Taxes, Fees, and Regulations", "Monitor proposed taxes, business fees, registration requirements, ordinances, and regulations that may affect local businesses."],
      ["Government Accountability", "Encourage responsible government spending, transparency in public decisions, fiscal accountability, and meaningful public participation."],
      ["Economic Development", "Support opportunities that strengthen Walton County's economy, encourage investment, promote entrepreneurship, and create sustainable economic growth."],
      ["Infrastructure and Transportation", "Advocate for infrastructure improvements, responsible transportation planning, road connectivity, and public investments that address the needs of Walton County's growing population."],
      ["Responsible Growth and Planning", "Participate in discussions about land use, development, infrastructure, and long-term planning to help balance economic opportunity with community needs."],
      ["Community Quality of Life", "Engage in issues involving public safety, environmental stewardship, transportation, community services, and other matters affecting the quality of life in Walton County."],
      ["Public Participation", "Encourage business leaders to engage with county commissioners, planning officials, and other government decision-makers through public meetings, written comments, and constructive dialogue."],
    ],
  },
  builders: {
    note: BUILDERS_NOTE,
    tagline: "A Unified Voice. A Stronger Industry. A Better Walton County.",
    items: [
      ["Fair and Consistent Regulations", "Advocate for reasonable, transparent, and consistently applied building codes, zoning requirements, setbacks, and land development regulations."],
      ["Permitting and Inspections", "Promote efficient, predictable, and transparent permitting and inspection processes."],
      ["Private Property Rights", "Support fair treatment of private property owners and reasonable application of land development regulations."],
      ["Land Development and Zoning", "Monitor proposed amendments to Walton County's Land Development Code, Comprehensive Plan, zoning regulations, development standards, and related ordinances."],
      ["Responsible Growth", "Encourage thoughtful development policies that balance economic opportunity, infrastructure capacity, environmental considerations, housing needs, and community quality of life."],
      ["Infrastructure and Transportation", "Advocate for appropriate investments in roads, utilities, stormwater systems, transportation connectivity, and public infrastructure needed to support current and future development."],
      ["Government Accountability", "Promote transparency, fiscal responsibility, consistency, and meaningful public participation in county government."],
      ["Housing and Construction Costs", "Participate in discussions about policies affecting housing availability, construction costs, project timelines, and the ability of builders to meet community needs."],
      ["Environmental and Stormwater Regulations", "Encourage clear, practical, and consistent environmental standards that protect natural resources while providing property owners and construction professionals with predictable requirements."],
      ["Industry Representation", "Provide an organized forum for construction professionals to participate in discussions with the Board of County Commissioners, Planning Commission, county staff, and other government bodies."],
    ],
  },
  tourism: {
    note: TOURISM_NOTE,
    tagline: "A Unified Voice. A Stronger Tourism Economy. A Better Walton County.",
    items: [
      ["Tourism Economy & Local Jobs", "Support policies that strengthen Walton County's tourism economy, local businesses, employment, and year-round economic opportunities."],
      ["Tourism Development Tax Accountability", "Advocate for transparent, responsible use of tourism tax revenues, with clear reporting on expenditures and measurable benefits."],
      ["Transportation & Traffic", "Support improved road connectivity, traffic management, parking, pedestrian safety, and transportation infrastructure."],
      ["Beach Access & Preservation", "Promote responsible beach management, clean beaches, public access, and protection of the natural resources that attract visitors."],
      ["Fair Business Regulations", "Oppose unnecessary fees, burdensome regulations, and inconsistent enforcement that negatively affect tourism-related businesses."],
      ["Tourism Marketing & Promotion", "Encourage effective, transparent destination marketing that supports local businesses and provides measurable economic value."],
      ["Workforce & Housing", "Support practical solutions to workforce availability, employee housing, transportation, and seasonal staffing challenges."],
      ["Infrastructure & Public Services", "Advocate for adequate public safety, utilities, stormwater management, sanitation, and infrastructure serving residents and visitors."],
      ["Government Transparency & Accountability", "Monitor county decisions, spending, regulations, and policies affecting tourism businesses, while encouraging meaningful public participation."],
      ["Tourism Industry Representation", "Give tourism-supported businesses an organized voice before the Board of County Commissioners, Tourist Development Council, and other government bodies."],
    ],
  },
};

export function greetingName(name) {
  const first = String(name ?? "").replace(/\s+/g, " ").trim().split(" ")[0] || "";
  return first;
}

export function welcomeHeading(name) {
  const first = greetingName(name);
  return first ? `Welcome back, ${first}` : "Welcome back";
}

export function postPlainText(source) {
  return String(source ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*\]\([^)\n]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)\n]*\)/g, "$1")
    .replace(/^\^\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[>*-]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipText(text, limit = 280) {
  const value = String(text || "").trim();
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit);
  const space = slice.lastIndexOf(" ");
  return (space > 160 ? slice.slice(0, space) : slice).trim();
}

export function welcomeExcerpt(paragraph) {
  const text = String(paragraph || "").trim();
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (!sentences) return clipText(text, 280);
  let out = "";
  for (const sentence of sentences) {
    const next = `${out}${sentence}`;
    if (out && next.trim().length > 280) break;
    out = next;
  }
  return out.replace(/\s+/g, " ").trim() || clipText(text, 280);
}

export function postsForHub(items, network) {
  return (items || [])
    .filter((item) => item && item.status !== "draft" && (item.network === network || item.share_all === 1 || item.share_all === true))
    .slice()
    .sort((a, b) => {
      const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pin) return pin;
      const bt = Date.parse(b.published_at || b.updated_at || "") || 0;
      const at = Date.parse(a.published_at || a.updated_at || "") || 0;
      if (bt !== at) return bt - at;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
}
