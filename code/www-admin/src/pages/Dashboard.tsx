import { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminProfile {
    name: string;
    email: string;
    avatar: string;
}

interface Stats {
    users: number;
    teams: number;
    projects: number;
    tasks: number;
}

interface User {
    id: string;
    name: string;
    email: string;
    teams: number;
    projects: number;
    tasks: number;
    joinedAt: string;
    status: "active" | "inactive";
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_ADMIN: AdminProfile = {
    name: "Admin Dylan",
    email: "dylan@iim.fr",
    avatar: "D",
};

const MOCK_STATS: Stats = {
    users: 142,
    teams: 38,
    projects: 91,
    tasks: 674,
};

const MOCK_USERS: User[] = [
    {
        id: "1",
        name: "Alice Martin",
        email: "alice@iim.fr",
        teams: 3,
        projects: 6,
        tasks: 12,
        joinedAt: "12 Jan 2025",
        status: "active",
    },
    {
        id: "2",
        name: "Bob Dupont",
        email: "bob@iim.fr",
        teams: 1,
        projects: 2,
        tasks: 5,
        joinedAt: "03 Feb 2025",
        status: "active",
    },
    {
        id: "3",
        name: "Clara Petit",
        email: "clara@iim.fr",
        teams: 4,
        projects: 9,
        tasks: 28,
        joinedAt: "19 Mar 2025",
        status: "active",
    },
    {
        id: "4",
        name: "David Leroy",
        email: "david@iim.fr",
        teams: 2,
        projects: 3,
        tasks: 7,
        joinedAt: "07 Apr 2025",
        status: "inactive",
    },
    {
        id: "5",
        name: "Emma Bernard",
        email: "emma@iim.fr",
        teams: 5,
        projects: 14,
        tasks: 41,
        joinedAt: "22 May 2025",
        status: "active",
    },
    {
        id: "6",
        name: "Félix Moreau",
        email: "felix@iim.fr",
        teams: 1,
        projects: 1,
        tasks: 3,
        joinedAt: "30 Jun 2025",
        status: "inactive",
    },
    {
        id: "7",
        name: "Grace Simon",
        email: "grace@iim.fr",
        teams: 3,
        projects: 7,
        tasks: 19,
        joinedAt: "15 Jul 2025",
        status: "active",
    },
    {
        id: "8",
        name: "Hugo Laurent",
        email: "hugo@iim.fr",
        teams: 2,
        projects: 4,
        tasks: 9,
        joinedAt: "01 Aug 2025",
        status: "active",
    },
];

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconDashboard = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
    </svg>
);
const IconUsers = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);
const IconLogout = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);
const IconSearch = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({
    label,
    value,
    index,
}: {
    label: string;
    value: number;
    index: number;
}) => {
    const icons = ["👥", "🏢", "📁", "✅"];
    return (
        <div
            style={{
                background: index % 2 === 0 ? "#111" : "#fff",
                color: index % 2 === 0 ? "#fff" : "#111",
                border: "1px solid #e0e0e0",
                borderRadius: "16px",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                transition: "transform 0.2s, box-shadow 0.2s",
                cursor: "default",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform =
                    "translateY(-3px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 8px 24px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform =
                    "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
        >
            <span style={{ fontSize: "28px" }}>{icons[index]}</span>
            <div
                style={{
                    fontSize: "42px",
                    fontWeight: "800",
                    fontFamily: "Georgia, serif",
                    lineHeight: 1,
                }}
            >
                {value.toLocaleString()}
            </div>
            <div
                style={{
                    fontSize: "13px",
                    fontWeight: "500",
                    opacity: 0.6,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}
            >
                {label}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
    const [search, setSearch] = useState("");
    const [activeSection, setActiveSection] = useState<"dashboard" | "users">(
        "dashboard",
    );

    const dashboardRef = useRef<HTMLDivElement>(null);
    const usersRef = useRef<HTMLDivElement>(null);

    const scrollTo = (section: "dashboard" | "users") => {
        setActiveSection(section);
        const ref = section === "dashboard" ? dashboardRef : usersRef;
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const filteredUsers = MOCK_USERS.filter(
        (u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <div
            style={{
                display: "flex",
                height: "100vh",
                background: "#f5f5f5",
                fontFamily: "'Helvetica Neue', sans-serif",
            }}
        >
            {/* ── Sidebar ── */}
            <aside
                style={{
                    width: "72px",
                    background: "#111",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: "24px",
                    paddingBottom: "24px",
                    gap: "8px",
                    flexShrink: 0,
                    position: "sticky",
                    top: 0,
                    height: "100vh",
                }}
            >
                {/* Logo */}
                <div
                    style={{
                        width: "40px",
                        height: "40px",
                        background: "#fff",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "900",
                        fontSize: "18px",
                        color: "#111",
                        marginBottom: "24px",
                    }}
                >
                    A
                </div>

                {[
                    {
                        id: "dashboard" as const,
                        icon: <IconDashboard />,
                        label: "Dashboard",
                    },
                    {
                        id: "users" as const,
                        icon: <IconUsers />,
                        label: "Utilisateurs",
                    },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => scrollTo(item.id)}
                        title={item.label}
                        style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            border: "none",
                            background:
                                activeSection === item.id
                                    ? "#fff"
                                    : "transparent",
                            color:
                                activeSection === item.id
                                    ? "#111"
                                    : "rgba(255,255,255,0.45)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                            if (activeSection !== item.id)
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = "rgba(255,255,255,0.08)";
                        }}
                        onMouseLeave={(e) => {
                            if (activeSection !== item.id)
                                (
                                    e.currentTarget as HTMLButtonElement
                                ).style.background = "transparent";
                        }}
                    >
                        {item.icon}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                <div
                    style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #667eea, #764ba2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: "14px",
                        marginBottom: "8px",
                    }}
                >
                    {MOCK_ADMIN.avatar}
                </div>

                <button
                    title="Déconnexion"
                    onClick={() => alert("TODO: déconnexion")}
                    style={{
                        width: "44px",
                        height: "44px",
                        borderRadius: "12px",
                        border: "none",
                        background: "transparent",
                        color: "rgba(255,255,255,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                            "#ff5555";
                        (
                            e.currentTarget as HTMLButtonElement
                        ).style.background = "rgba(255,85,85,0.12)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                            "rgba(255,255,255,0.35)";
                        (
                            e.currentTarget as HTMLButtonElement
                        ).style.background = "transparent";
                    }}
                >
                    <IconLogout />
                </button>
            </aside>

            {/* ── Main scrollable ── */}
            <main
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "40px 48px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "80px",
                }}
            >
                {/* ── SECTION DASHBOARD ── */}
                <section ref={dashboardRef}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "40px",
                        }}
                    >
                        <div>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: "13px",
                                    color: "#999",
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    marginBottom: "6px",
                                }}
                            >
                                Espace Administrateur
                            </p>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: "32px",
                                    fontWeight: "800",
                                    color: "#111",
                                    fontFamily: "Georgia, serif",
                                }}
                            >
                                Bonjour, {MOCK_ADMIN.name.split(" ")[1]} 👋
                            </h1>
                        </div>
                        <div
                            style={{
                                background: "#fff",
                                borderRadius: "12px",
                                padding: "10px 16px",
                                border: "1px solid #e8e8e8",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                            }}
                        >
                            <span
                                style={{
                                    fontWeight: "700",
                                    fontSize: "14px",
                                    color: "#111",
                                }}
                            >
                                {MOCK_ADMIN.name}
                            </span>
                            <span style={{ fontSize: "12px", color: "#999" }}>
                                {MOCK_ADMIN.email}
                            </span>
                        </div>
                    </div>

                    <h2
                        style={{
                            margin: "0 0 20px",
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#999",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}
                    >
                        Statistiques globales
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: "16px",
                        }}
                    >
                        <StatCard
                            label="Utilisateurs"
                            value={MOCK_STATS.users}
                            index={0}
                        />
                        <StatCard
                            label="Équipes"
                            value={MOCK_STATS.teams}
                            index={1}
                        />
                        <StatCard
                            label="Projets"
                            value={MOCK_STATS.projects}
                            index={2}
                        />
                        <StatCard
                            label="Tâches"
                            value={MOCK_STATS.tasks}
                            index={3}
                        />
                    </div>
                </section>

                {/* ── SECTION UTILISATEURS ── */}
                <section ref={usersRef} style={{ paddingBottom: "60px" }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "24px",
                        }}
                    >
                        <div>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: "13px",
                                    color: "#999",
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    marginBottom: "6px",
                                }}
                            >
                                Gestion
                            </p>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: "32px",
                                    fontWeight: "800",
                                    color: "#111",
                                    fontFamily: "Georgia, serif",
                                }}
                            >
                                Utilisateurs
                            </h1>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                background: "#fff",
                                borderRadius: "12px",
                                padding: "12px 16px",
                                border: "1px solid #e8e8e8",
                                width: "320px",
                            }}
                        >
                            <span style={{ color: "#aaa" }}>
                                <IconSearch />
                            </span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher par nom ou email…"
                                style={{
                                    border: "none",
                                    outline: "none",
                                    fontSize: "14px",
                                    color: "#111",
                                    background: "transparent",
                                    width: "100%",
                                }}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "#aaa",
                                        fontSize: "18px",
                                        lineHeight: 1,
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div>

                    <p
                        style={{
                            margin: "0 0 16px",
                            fontSize: "13px",
                            color: "#999",
                        }}
                    >
                        {filteredUsers.length} utilisateur
                        {filteredUsers.length > 1 ? "s" : ""} trouvé
                        {filteredUsers.length > 1 ? "s" : ""}
                    </p>

                    <div
                        style={{
                            background: "#fff",
                            borderRadius: "16px",
                            border: "1px solid #e8e8e8",
                            overflow: "hidden",
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                            }}
                        >
                            <thead>
                                <tr
                                    style={{
                                        borderBottom: "1px solid #f0f0f0",
                                    }}
                                >
                                    {[
                                        "Utilisateur",
                                        "Email",
                                        "Équipes",
                                        "Projets",
                                        "Tâches",
                                        "Inscription",
                                    ].map((h) => (
                                        <th
                                            key={h}
                                            style={{
                                                padding: "14px 20px",
                                                textAlign: "left",
                                                fontSize: "12px",
                                                fontWeight: "600",
                                                color: "#aaa",
                                                letterSpacing: "0.06em",
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((u, i) => (
                                    <tr
                                        key={u.id}
                                        style={{
                                            borderBottom:
                                                i < filteredUsers.length - 1
                                                    ? "1px solid #f5f5f5"
                                                    : "none",
                                            transition: "background 0.1s",
                                        }}
                                        onMouseEnter={(e) =>
                                            ((
                                                e.currentTarget as HTMLTableRowElement
                                            ).style.background = "#fafafa")
                                        }
                                        onMouseLeave={(e) =>
                                            ((
                                                e.currentTarget as HTMLTableRowElement
                                            ).style.background = "transparent")
                                        }
                                    >
                                        <td style={{ padding: "14px 20px" }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "32px",
                                                        height: "32px",
                                                        borderRadius: "50%",
                                                        background: `hsl(${u.id.charCodeAt(0) * 40}, 60%, 88%)`,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                        fontSize: "13px",
                                                        fontWeight: "700",
                                                        color: "#444",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {u.name[0]}
                                                </div>
                                                <span
                                                    style={{
                                                        fontWeight: "600",
                                                        fontSize: "14px",
                                                        color: "#111",
                                                    }}
                                                >
                                                    {u.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td
                                            style={{
                                                padding: "14px 20px",
                                                fontSize: "14px",
                                                color: "#666",
                                            }}
                                        >
                                            {u.email}
                                        </td>
                                        <td
                                            style={{
                                                padding: "14px 20px",
                                                fontSize: "14px",
                                                color: "#666",
                                            }}
                                        >
                                            {u.teams}
                                        </td>
                                        <td
                                            style={{
                                                padding: "14px 20px",
                                                fontSize: "14px",
                                                color: "#666",
                                            }}
                                        >
                                            {u.projects}
                                        </td>
                                        <td
                                            style={{
                                                padding: "14px 20px",
                                                fontSize: "14px",
                                                color: "#666",
                                            }}
                                        >
                                            {u.tasks}
                                        </td>
                                        <td
                                            style={{
                                                padding: "14px 20px",
                                                fontSize: "13px",
                                                color: "#999",
                                            }}
                                        >
                                            {u.joinedAt}
                                        </td>
                                    </tr>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            style={{
                                                padding: "40px",
                                                textAlign: "center",
                                                color: "#bbb",
                                                fontSize: "14px",
                                            }}
                                        >
                                            Aucun utilisateur trouvé
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}
