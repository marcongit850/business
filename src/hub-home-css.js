export const HUB_HOME_CSS = `
:root { --gold-dark: #876626; --muted: #4a5563; }
.site-header { border-top: 0; background: var(--cream); }
.hub-nav a.hub-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: underline;
  text-decoration-color: var(--gold);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
  opacity: 1;
}
.hub-nav a, .hub-nav button.sign-out {
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--navy);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  opacity: 0.72;
  cursor: pointer;
}
.hub-nav { align-items: center; }
.header-also { padding: 0 0 14px; }
.header-also .also-member { margin: 0; font-size: 14px; }
.also-member a { text-decoration: underline; text-underline-offset: 3px; }
.prose h2, .prose h3, .prose h4 {
  font-family: Cormorant, Georgia, serif;
  font-weight: 500;
  line-height: 1.2;
  margin: 1.05em 0 0.35em;
}
.prose h2 { font-size: 32px; }
.prose h3 { font-size: 26px; }
.prose h4 { font-size: 22px; }
.prose li { margin: 0 0 6px; }
.prose img, img.prose-img, img.thumb {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}
.post-read {
  background: #fff;
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold);
  padding: 28px 26px 32px;
}
.post-read h1 { font-size: clamp(32px, 5vw, 44px); line-height: 1.12; margin: 8px 0 12px; }
.member-home { display: block; }
.hub-hero { position: relative; color: var(--cream); background: var(--navy); overflow: hidden; }
.hub-hero-photo, .hub-hero-overlay { position: absolute; inset: 0; }
.hub-hero-photo { background: var(--navy) center 42% / cover no-repeat; }
.hub-hero-overlay {
  background: linear-gradient(90deg, rgba(0, 24, 64, 0.84) 0%, rgba(0, 24, 64, 0.62) 30%, rgba(0, 24, 64, 0.36) 55%, rgba(0, 24, 64, 0.18) 100%);
}
.hub-hero h1, .hub-hero-sub { text-shadow: 0 1px 16px rgba(0, 16, 40, 0.35); }
.hub-hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 44px 0 78px;
}
.hub-hero-copy { max-width: 720px; min-width: 0; }
.hub-hero .eyebrow { color: #ddbd7d; }
.hub-hero .eyebrow::before {
  content: "";
  display: inline-block;
  width: 34px;
  height: 2px;
  background: var(--gold);
  vertical-align: middle;
  margin-right: 15px;
}
.hub-hero h1 {
  font-size: 42px;
  line-height: 1.05;
  letter-spacing: -0.6px;
  margin: 16px 0;
  color: var(--cream);
}
.hub-hero-sub { font-size: 17px; line-height: 1.5; max-width: 38rem; color: rgba(246, 243, 236, 0.92); margin: 0; }
.hub-hero-seal { width: 132px; height: 132px; flex: none; box-shadow: 0 8px 28px rgba(0, 16, 40, 0.35); }
.hub-hero-seal.seal { border-radius: 50%; object-fit: cover; }
.hub-hero-seal.tile { border-radius: 0; object-fit: contain; background: #001840; }
.actions-wrap { position: relative; z-index: 2; margin-top: -44px; margin-bottom: 8px; }
.action-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.action-card {
  display: block;
  background: #fff;
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold);
  padding: 22px 22px 24px;
  box-shadow: 0 10px 28px rgba(0, 24, 64, 0.08);
  min-height: 100%;
  color: var(--navy);
}
.action-card.primary {
  background: var(--gold);
  border-color: var(--gold);
  box-shadow: 0 12px 32px rgba(0, 24, 64, 0.14);
}
.action-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 24, 64, 0.22);
  border-radius: 50%;
  margin-bottom: 14px;
  color: var(--navy);
}
.action-card:not(.primary) .action-icon { border-color: rgba(208, 160, 64, 0.55); }
button.action-card {
  width: 100%;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  appearance: none;
}
.install-card[hidden] { display: none; }
.action-icon svg { width: 20px; height: 20px; display: block; }
.action-card h2 {
  font-family: Source, Arial, sans-serif;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.25;
  margin: 0 0 8px;
}
.action-card p { font-size: 15px; line-height: 1.5; margin: 0; }
.points-earn {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  color: var(--gold-dark);
}
.social-actions { display: grid; gap: 8px; margin-top: 10px; }
.social-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
}
.social-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  min-width: 0;
}
.social-actions .button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
  text-align: center;
  text-decoration: none;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.2;
}
.social-row .follow-button { min-width: 0; }
.follow-button {
  background: none;
  border: none;
  padding: 0;
  color: var(--navy);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.follow-button:disabled { cursor: default; text-decoration: none; opacity: 0.72; }
.follow-status { margin: 0; font-size: 13px; font-weight: 650; }
.follow-status:empty { display: none; }
.points-panel {
  margin-top: 16px;
  background: #fff;
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold);
  padding: 16px 18px 18px;
}
.points-panel h2 {
  font-family: Source, Arial, sans-serif;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
  margin: 0 0 6px;
}
.points-panel p { margin: 0; font-size: 14px; line-height: 1.5; }
.points-panel p + p { margin-top: 6px; }
.member-main { padding: 40px 0 64px; }
.hub-layout { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: start; }
.member-main .section-heading { display: block; margin-bottom: 8px; }
.member-main .section-heading h2 { font-size: 36px; line-height: 1.1; margin-top: 10px; }
.member-main .section-note { display: block; font-size: 15px; line-height: 1.5; margin: 10px 0 8px; max-width: 28rem; }
.priority-list { display: grid; grid-template-columns: 1fr; list-style: none; margin: 0; padding: 0; }
.priority { display: flex; align-items: flex-start; gap: 14px; border-top: 1px solid var(--line); padding: 18px 0; }
.priority-num {
  font-family: Cormorant, Georgia, serif;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  min-width: 28px;
  color: var(--gold-dark);
  font-variant-numeric: lining-nums tabular-nums;
}
.priority h3 { font-family: Source, Arial, sans-serif; font-size: 17px; line-height: 1.25; font-weight: 650; margin: 0 0 6px; }
.priority p { font-size: 15px; line-height: 1.5; margin: 0; }
.latest { margin-top: 44px; }
.post-card {
  margin-top: 18px;
  background: #fff;
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold);
  padding: 26px 26px 28px;
}
.post-card h3 { font-family: Cormorant, Georgia, serif; font-size: 28px; font-weight: 500; line-height: 1.15; margin: 0 0 12px; }
.post-card h3 a { color: inherit; }
.post-card .excerpt, .post-card .prose { font-size: 16px; line-height: 1.55; max-width: 42rem; }
.post-card .meta { margin: 0 0 10px; }
.post-card .text-link { display: inline-block; font-size: 15px; font-weight: 600; border-bottom: 1px solid #a4acb4; padding-bottom: 3px; margin-top: 16px; text-decoration: none; }
.side-stack { display: grid; gap: 16px; }
.side-panel { background: #fff; border: 1px solid var(--line); border-top: 2px solid var(--gold); padding: 22px 22px 24px; }
.side-panel h2 {
  font-family: Source, Arial, sans-serif;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0 0 12px;
}
.empty-state { font-size: 16px; line-height: 1.5; color: #3a4660; margin: 0; }
.issue-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.issue-list li { display: grid; gap: 2px; }
.issue-list .my-issue-title { font-weight: 700; overflow-wrap: anywhere; }
.profile-name { font-family: Cormorant, Georgia, serif; font-size: 26px; font-weight: 500; line-height: 1.15; margin: 0; }
.profile-company { margin: 6px 0 0; font-size: 15px; color: #3a4660; }
.side-panel .text-link { display: inline-block; margin-top: 14px; font-size: 15px; font-weight: 600; border-bottom: 1px solid #a4acb4; padding-bottom: 3px; text-decoration: none; }
.member-footer { padding: 35px 0 22px; }
.member-footer .footer-top { display: grid; gap: 24px; padding-bottom: 26px; }
.member-footer .closing { font-size: 28px; line-height: 1.2; max-width: 520px; }
.member-footer .button { justify-self: start; cursor: pointer; font-family: inherit; }
.member-footer .footer-bottom {
  border-top: 1px solid var(--line);
  padding-top: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
  letter-spacing: 0.4px;
}
.footer-social {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  color: #d0a040;
  border: 1px solid rgba(208, 160, 64, 0.45);
  border-radius: 999px;
}
.footer-social svg { display: block; width: 16px; height: 16px; }
.footer-socials { display: inline-flex; align-items: center; gap: 10px; flex: none; }
.contact-dialog {
  inset: unset;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  margin: 0;
  padding: 0;
  border: none;
  background: #f6f3ec;
  color: #001840;
  box-shadow: 0 24px 80px rgba(0, 24, 64, 0.28);
}
.contact-dialog::backdrop, dialog.contact-dialog::backdrop { background: rgba(0, 24, 64, 0.55); }
dialog.contact-dialog { position: fixed; }
.hub-dialog [hidden] { display: none; }
.install-note { margin: 0 0 8px; font-size: 16px; line-height: 1.5; }
.install-actions { margin: 0 0 18px; }
.install-actions .button { cursor: pointer; font-family: inherit; }
.install-steps { margin: 0 0 18px; }
.install-steps h3 {
  font-family: Source, Arial, sans-serif;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0 0 8px;
}
.install-steps p { margin: 0 0 8px; font-size: 16px; line-height: 1.5; }
.install-steps ol { margin: 0; padding-left: 1.2em; }
.install-steps li { margin: 0 0 6px; font-size: 16px; line-height: 1.45; }
.invite-message { margin: 0 0 16px; font-size: 16px; line-height: 1.5; }
.share-actions { display: grid; gap: 10px; }
.share-actions .button {
  display: block;
  width: 100%;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  font-family: inherit;
}
.invite-copied { margin: 12px 0 0; font-weight: 700; }
.contact-dialog-inner { padding: 32px 28px 28px; }
.contact-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.contact-dialog h2 { margin-top: 12px; font-size: 36px; line-height: 1.08; }
.contact-dialog-inner > p { margin: 14px 0 22px; font-size: 16px; line-height: 1.55; }
.contact-close {
  background: none;
  border: none;
  padding: 0;
  color: #001840;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 1px solid #a4acb4;
}
.contact-form { display: grid; gap: 16px; }
.contact-form label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; }
.contact-form input, .contact-form textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #d9d8ce;
  background: #fff;
  color: #001840;
  font: inherit;
  font-size: 16px;
}
.contact-form textarea { min-height: 140px; resize: vertical; }
.contact-form .button { justify-self: start; cursor: pointer; font-family: inherit; }
.hp-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
@media (min-width: 801px) {
  .hub-hero-inner { padding: 72px 0 108px; }
  .hub-hero h1 { font-size: 64px; letter-spacing: -1.2px; margin: 18px 0; }
  .hub-hero-sub { font-size: 20px; }
  .hub-hero-seal { width: 168px; height: 168px; }
  .actions-wrap { margin-top: -52px; }
  .action-grid { grid-template-columns: 1fr 1fr; gap: 22px; }
  .action-card { padding: 26px 26px 28px; }
  .action-card h2 { font-size: 19px; }
  .member-main { padding: 56px 0 88px; }
  .hub-layout { grid-template-columns: minmax(0, 1fr) 300px; gap: 56px; }
  .member-main .section-heading h2 { font-size: 44px; }
  .priority-list { grid-template-columns: 1fr 1fr; column-gap: 48px; }
  .priority { gap: 16px; padding: 20px 0 22px; }
  .priority h3 { font-size: 18px; }
  .latest { margin-top: 56px; }
  .post-card { padding: 30px 32px 32px; }
  .post-card h3 { font-size: 32px; }
  .member-footer { padding: 49px 0 25px; }
  .member-footer .footer-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 48px; padding-bottom: 34px; }
  .member-footer .closing { font-size: 30px; }
  .member-footer .footer-bottom { font-size: 12px; }
}
@media (min-width: 1180px) {
  .action-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (min-width: 801px) and (max-width: 1040px) {
  .hub-hero h1 { font-size: 52px; }
  .hub-hero-seal { width: 140px; height: 140px; }
  .hub-layout { gap: 36px; grid-template-columns: minmax(0, 1fr) 260px; }
}
@media (max-width: 640px) {
  .hub-nav a.header-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
@media (max-width: 800px) {
  .site-header .header-inner { flex-direction: row; align-items: center; flex-wrap: nowrap; height: auto; min-height: 64px; padding: 10px 0; }
  .hub-nav { width: auto; margin-left: auto; padding-top: 0; }
  .hub-hero-inner { display: block; position: relative; padding: 36px 0 72px; }
  .hub-hero-seal { position: absolute; right: 0; top: 30px; width: 108px; height: 108px; }
  .hub-hero h1 { padding-right: 118px; }
  .hub-hero-overlay {
    background: linear-gradient(105deg, rgba(0, 24, 64, 0.78) 0%, rgba(0, 24, 64, 0.55) 48%, rgba(0, 24, 64, 0.28) 100%);
  }
  .hub-nav { gap: 12px; }
}
@media (max-width: 380px) {
  .hub-hero h1 { font-size: 36px; }
  .hub-nav a.hub-label { font-size: 11px; }
  .hub-nav a, .hub-nav button.sign-out { font-size: 12px; }
}
@media (display-mode: standalone) {
  .install-card { display: none; }
}
`;
