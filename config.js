// Supabase connection. The publishable key is safe to ship in a public site.
// Never put the secret / service_role key here.
window.SQUAD_CONFIG = {
  supabaseUrl: "https://vujaetuwzakgxuvzpyxg.supabase.co",
  supabaseKey: "sb_publishable_3fnIEiVDkKq6-xNJjeqZRQ_36I5hFVW",
  squadName: "Squad Tracker",
  modes: ["Builds", "Zero Build", "Reload", "Ranked Builds", "Ranked Zero Build", "Other"],
  elimCauses: [
    "Won the game",
    "Hot drop fight",
    "Third-partied",
    "Lost a gunfight",
    "Storm / rotation",
    "Got pinched in endgame",
    "Sniped / ambushed",
    "Fall damage / misplay",
    "Other"
  ]
};
