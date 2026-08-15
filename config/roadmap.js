// What the marketing material promises, and where each promise actually stands.
//
// Every item renders from a locale key pair (pages.soon.items.<key>.title/body),
// so the copy stays translatable, and from a status flag:
//
//   'live' — shipped; the card links somewhere real and reads as available
//   'soon' — announced but not built; the card carries a "coming soon" badge
//
// When a feature ships, flip its status to 'live' and give it a href. Nothing
// else has to change. Keeping the roadmap in one file is deliberate: it is the
// only place that decides whether the site claims to do something, so a promise
// cannot drift away from the code by accident.

const ROADMAP_GROUPS = [
  {
    key: 'ai',
    icon: 'fa-wand-magic-sparkles',
    accent: 'primary',
    items: [
      { key: 'ai_search', icon: 'fa-magnifying-glass-chart', status: 'live', href: '/listings' },
      { key: 'ai_listing', icon: 'fa-pen-fancy', status: 'live', href: '/listings/create' },
      { key: 'ai_job_match', icon: 'fa-people-arrows', status: 'live', href: '/kariyer' }
    ]
  },
  {
    key: 'trust',
    icon: 'fa-shield-halved',
    accent: 'success',
    items: [
      { key: 'ratings', icon: 'fa-star', status: 'live', href: '/sss#puanlama' },
      { key: 'guarantee', icon: 'fa-handshake', status: 'live', href: '/profile/taleplerim' },
      { key: 'bidding', icon: 'fa-gavel', status: 'live', href: '/teklifler' },
      { key: 'violation', icon: 'fa-triangle-exclamation', status: 'live', href: '/guvenlik' }
    ]
  },
  {
    key: 'jobs',
    icon: 'fa-briefcase',
    accent: 'accent',
    items: [
      { key: 'cv', icon: 'fa-file-lines', status: 'live', href: '/kariyer/cv' },
      { key: 'one_click', icon: 'fa-hand-pointer', status: 'live', href: '/kariyer' },
      { key: 'employer_panel', icon: 'fa-building-user', status: 'live', href: '/kariyer/basvurular' }
    ]
  },
  {
    key: 'pro',
    icon: 'fa-chart-line',
    accent: 'warning',
    items: [
      { key: 'pro_panel', icon: 'fa-table-columns', status: 'live', href: '/panel' },
      { key: 'pro_stats', icon: 'fa-chart-simple', status: 'live', href: '/panel' },
      { key: 'premium', icon: 'fa-crown', status: 'soon' }
    ]
  },
  {
    key: 'audience',
    icon: 'fa-users',
    accent: 'danger',
    items: [
      { key: 'student', icon: 'fa-graduation-cap', status: 'live', href: '/ogrenci' },
      { key: 'investor', icon: 'fa-chart-pie', status: 'live', href: '/yatirimci' },
      { key: 'south_cyprus', icon: 'fa-map-location-dot', status: 'live', href: '/listings' }
    ]
  }
];

const allItems = () => ROADMAP_GROUPS.flatMap((group) => group.items);

const countByStatus = (status) => allItems().filter((item) => item.status === status).length;

module.exports = {
  ROADMAP_GROUPS,
  allItems,
  countByStatus
};
