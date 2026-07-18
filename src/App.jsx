import { useState, useEffect } from "react";
import { Plus, X, MapPin, Utensils, Users, Sparkles, Star, ArrowLeft, Share2, Check } from "lucide-react";

// ---- Supabase config ----
// Fyll inn disse to etter du har opprettet et gratis prosjekt på supabase.com
const SUPABASE_URL = "https://rmrukmijuepsbehlntak.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtcnVrbWlqdWVwc2JlaGxudGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMTI3NjAsImV4cCI6MjA5OTg4ODc2MH0.HAWxs-jI20_pGl_IoR7m1hzRDszd5nIQZXvtdQ1bqVs";
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const DEFAULT_CATEGORIES = ["Mat", "Service", "Stemning"];

// ---------- Local storage helpers (device memory: which lists + which name I use) ----------
function getMyLists() {
  try {
    return JSON.parse(localStorage.getItem("rl_my_lists") || "[]");
  } catch {
    return [];
  }
}
function saveMyList(entry) {
  const lists = getMyLists().filter((l) => l.code !== entry.code);
  lists.unshift(entry);
  localStorage.setItem("rl_my_lists", JSON.stringify(lists));
}

// ---------- Data layer (with in-memory fallback if Supabase not configured) ----------
const memoryDB = { lists: [], members: [], restaurants: [] };

async function createList(name, categories) {
  const code = genCode();
  const entry = { name, code, categories };
  if (!configured) {
    const row = { id: Date.now(), ...entry, created_at: new Date().toISOString() };
    memoryDB.lists.push(row);
    return row;
  }
  const [row] = await sb("lists", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(entry),
  });
  return row;
}

async function findListByCode(code) {
  if (!configured) {
    return memoryDB.lists.find((l) => l.code === code.toUpperCase()) || null;
  }
  const rows = await sb(`lists?code=eq.${code.toUpperCase()}&select=*`);
  return rows[0] || null;
}

async function getList(id) {
  if (!configured) return memoryDB.lists.find((l) => l.id === id) || null;
  const rows = await sb(`lists?id=eq.${id}&select=*`);
  return rows[0] || null;
}

async function getMembers(listId) {
  if (!configured) return memoryDB.members.filter((m) => m.list_id === listId);
  return sb(`members?list_id=eq.${listId}&select=*`);
}

async function ensureMember(listId, name) {
  const existing = await getMembers(listId);
  const found = existing.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  if (!configured) {
    const row = { id: Date.now(), list_id: listId, name };
    memoryDB.members.push(row);
    return row;
  }
  const [row] = await sb("members", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ list_id: listId, name }),
  });
  return row;
}

async function getRestaurants(listId) {
  if (!configured)
    return memoryDB.restaurants.filter((r) => r.list_id === listId);
  return sb(`restaurants?list_id=eq.${listId}&select=*&order=created_at.desc`);
}

async function addRestaurantRow(listId, name, place, ratings) {
  const entry = { list_id: listId, name, place, ratings };
  if (!configured) {
    const row = { id: Date.now(), ...entry, created_at: new Date().toISOString() };
    memoryDB.restaurants.unshift(row);
    return row;
  }
  const [row] = await sb("restaurants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(entry),
  });
  return row;
}

async function updateRestaurantRatings(restaurantId, ratings) {
  if (!configured) {
    const row = memoryDB.restaurants.find((r) => r.id === restaurantId);
    if (row) row.ratings = ratings;
    return row;
  }
  const [row] = await sb(`restaurants?id=eq.${restaurantId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ratings }),
  });
  return row;
}

// ---------- Rating math ----------
// ratings shape: { [memberName]: { [category]: number } }
function overallAvg(r) {
  const vals = [];
  Object.values(r.ratings || {}).forEach((catMap) => {
    Object.values(catMap).forEach((v) => {
      if (typeof v === "number") vals.push(v);
    });
  });
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function personAvg(r, memberName) {
  const catMap = (r.ratings || {})[memberName];
  if (!catMap) return null;
  const vals = Object.values(catMap).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function categoryAvg(r, category) {
  const vals = Object.values(r.ratings || {})
    .map((catMap) => catMap[category])
    .filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// ================= UI =================

function Stamp({ initial, value }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col items-center gap-1 opacity-30">
        <div className="w-11 h-11 rounded-full border-2 border-dashed border-[#e8cfa0] flex items-center justify-center font-serif text-sm text-[#e8cfa0]">
          {initial}
        </div>
        <span className="text-[10px] tracking-widest uppercase text-[#e8cfa0]">–</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-11 h-11 rounded-full border-2 border-[#d4a24e] flex items-center justify-center font-serif text-base text-[#f4e4c8] bg-[#5c1a1f] shadow-[0_0_0_3px_rgba(212,162,78,0.15)]">
        {initial}
      </div>
      <span className="text-[10px] tracking-widest uppercase text-[#d4a24e] font-semibold">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function RatingSlider({ label, value, onChange }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold">
          {label}
        </label>
        <span className="font-serif text-lg text-[#f4e4c8]">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#d4a24e]"
        style={{
          background: `linear-gradient(to right, #d4a24e ${((value - 1) / 9) * 100}%, #3a1014 ${((value - 1) / 9) * 100}%)`,
        }}
      />
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[#3a1014] w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto border-t sm:border border-[#d4a24e]/30">
        <div className="sticky top-0 bg-[#3a1014] px-6 pt-6 pb-3 flex items-start justify-between border-b border-[#d4a24e]/20 z-10">
          <div>
            {eyebrow && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#d4a24e] mb-1">{eyebrow}</p>
            )}
            <h2 className="font-serif text-2xl text-[#f4e4c8]">{title}</h2>
          </div>
          <button onClick={onClose} className="text-[#c9a876] hover:text-[#f4e4c8] p-1">
            <X size={22} />
          </button>
        </div>
        <div className="p-6 pt-4">{children}</div>
      </div>
    </div>
  );
}

function TextField({ label, icon, ...props }) {
  return (
    <div className="mb-5">
      <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold block mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a6a5a]">{icon}</div>}
        <input
          {...props}
          className={`w-full bg-[#2a0c0f] border border-[#d4a24e]/30 rounded-lg py-3 text-[#f4e4c8] placeholder-[#8a6a5a] font-serif text-lg focus:outline-none focus:border-[#d4a24e] focus:ring-2 focus:ring-[#d4a24e]/20 ${
            icon ? "pl-9 pr-4" : "px-4"
          }`}
        />
      </div>
    </div>
  );
}

// ---------- Landing: create or join a list ----------
function Landing({ onEnter }) {
  const [mode, setMode] = useState(null); // 'create' | 'join' | null
  const [myLists, setMyLists] = useState(getMyLists());

  // Create form state
  const [listName, setListName] = useState("");
  const [yourName, setYourName] = useState("");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Join form state
  const [code, setCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const updateCategory = (i, val) => {
    const next = [...categories];
    next[i] = val;
    setCategories(next);
  };
  const addCategory = () => setCategories([...categories, ""]);
  const removeCategory = (i) => setCategories(categories.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!listName.trim() || !yourName.trim()) return;
    const cleanCats = categories.map((c) => c.trim()).filter(Boolean);
    if (!cleanCats.length) return;
    setBusy(true);
    setError("");
    try {
      const list = await createList(listName.trim(), cleanCats);
      await ensureMember(list.id, yourName.trim());
      saveMyList({ id: list.id, code: list.code, name: list.name, myName: yourName.trim() });
      onEnter(list.id, yourName.trim());
    } catch (e) {
      setError("Klarte ikke opprette listen. Sjekk Supabase-oppsettet.");
    }
    setBusy(false);
  };

  const handleJoin = async () => {
    if (!code.trim() || !joinName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const list = await findListByCode(code.trim());
      if (!list) {
        setError("Fant ingen liste med den koden.");
        setBusy(false);
        return;
      }
      await ensureMember(list.id, joinName.trim());
      saveMyList({ id: list.id, code: list.code, name: list.name, myName: joinName.trim() });
      onEnter(list.id, joinName.trim());
    } catch (e) {
      setError("Noe gikk galt. Prøv igjen.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8] px-6 pt-14 pb-10">
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] mb-2 flex items-center gap-1.5">
        <Utensils size={12} /> Restaurantlister
      </p>
      <h1 className="font-serif text-4xl leading-tight text-[#f4e4c8] mb-2">
        Steder dere har<br />spist godt.
      </h1>
      <p className="text-sm text-[#c9a876] mb-8">
        Lag en liste for kjæresten, kompisgjengen eller familien — hver liste har egen kode og egne kategorier.
      </p>

      {myLists.length > 0 && !mode && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[#8a6a5a] mb-2">Dine lister</p>
          <div className="space-y-2">
            {myLists.map((l) => (
              <button
                key={l.code}
                onClick={() => onEnter(l.id, l.myName)}
                className="w-full text-left bg-[#3a1014] rounded-xl px-4 py-3.5 border border-[#d4a24e]/15 flex items-center justify-between"
              >
                <div>
                  <p className="font-serif text-lg text-[#f4e4c8]">{l.name}</p>
                  <p className="text-xs text-[#8a6a5a]">som {l.myName} · kode {l.code}</p>
                </div>
                <span className="text-[#d4a24e]">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!mode && (
        <div className="space-y-3">
          <button
            onClick={() => setMode("create")}
            className="w-full bg-[#d4a24e] text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-4 rounded-xl active:scale-[0.98] transition-transform"
          >
            + Opprett ny liste
          </button>
          <button
            onClick={() => setMode("join")}
            className="w-full bg-[#3a1014] border border-[#d4a24e]/30 text-[#f4e4c8] font-semibold uppercase tracking-widest text-sm py-4 rounded-xl active:scale-[0.98] transition-transform"
          >
            Bli med i liste
          </button>
        </div>
      )}

      {mode === "create" && (
        <div>
          <button onClick={() => setMode(null)} className="text-[#c9a876] flex items-center gap-1 text-sm mb-5">
            <ArrowLeft size={15} /> Tilbake
          </button>
          <TextField label="Navn på liste" placeholder="F.eks. Kompisgjengen" value={listName} onChange={(e) => setListName(e.target.value)} />
          <TextField label="Ditt navn" placeholder="F.eks. Pål Vegard" value={yourName} onChange={(e) => setYourName(e.target.value)} />

          <div className="mb-6">
            <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold block mb-2">
              Kategorier dere skal vurdere
            </label>
            <div className="space-y-2">
              {categories.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={c}
                    onChange={(e) => updateCategory(i, e.target.value)}
                    className="flex-1 bg-[#2a0c0f] border border-[#d4a24e]/30 rounded-lg px-3 py-2.5 text-[#f4e4c8] text-sm focus:outline-none focus:border-[#d4a24e]"
                  />
                  {categories.length > 1 && (
                    <button onClick={() => removeCategory(i)} className="text-[#8a6a5a] px-2">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addCategory} className="text-[#d4a24e] text-sm mt-2 flex items-center gap-1">
              <Plus size={14} /> Legg til kategori
            </button>
          </div>

          {error && <p className="text-red-300 text-sm mb-3">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={busy || !listName.trim() || !yourName.trim()}
            className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
          >
            {busy ? "Oppretter …" : "Opprett liste"}
          </button>
        </div>
      )}

      {mode === "join" && (
        <div>
          <button onClick={() => setMode(null)} className="text-[#c9a876] flex items-center gap-1 text-sm mb-5">
            <ArrowLeft size={15} /> Tilbake
          </button>
          <TextField
            label="Kode fra den som opprettet listen"
            placeholder="F.eks. 7QX2P9"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ letterSpacing: "0.15em" }}
          />
          <TextField label="Ditt navn" placeholder="F.eks. Kristian" value={joinName} onChange={(e) => setJoinName(e.target.value)} />

          {error && <p className="text-red-300 text-sm mb-3">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={busy || !code.trim() || !joinName.trim()}
            className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
          >
            {busy ? "Blir med …" : "Bli med i listen"}
          </button>
        </div>
      )}

      {!configured && (
        <p className="text-xs text-[#8a6a5a] mt-8 text-center">
          Lokal test-modus — koble til Supabase for ekte deling mellom telefoner.
        </p>
      )}
    </div>
  );
}

// ---------- Add / edit restaurant form ----------
// If editRestaurant is passed, form is in edit mode: name/place locked,
// only the current user's own ratings can be changed.
function AddForm({ list, members, myName, editRestaurant, onAdd, onEdit, onClose }) {
  const isEdit = Boolean(editRestaurant);
  const [name, setName] = useState(editRestaurant?.name || "");
  const [place, setPlace] = useState(editRestaurant?.place || "");
  const [activeMember, setActiveMember] = useState(myName);
  const [ratings, setRatings] = useState(() => {
    const init = {};
    members.forEach((m) => {
      init[m.name] = {};
      list.categories.forEach((c) => {
        init[m.name][c] = editRestaurant?.ratings?.[m.name]?.[c] ?? 7;
      });
    });
    return init;
  });

  const setR = (member, cat, val) =>
    setRatings((prev) => ({ ...prev, [member]: { ...prev[member], [cat]: val } }));

  const submit = () => {
    if (isEdit) {
      onEdit(editRestaurant.id, ratings);
      onClose();
      return;
    }
    if (!name.trim()) return;
    onAdd(name.trim(), place.trim(), ratings);
    onClose();
  };

  return (
    <Modal
      title={isEdit ? editRestaurant.name : "Legg til restaurant"}
      eyebrow={isEdit ? "Rediger dine vurderinger" : "Nytt besøk"}
      onClose={onClose}
    >
      {!isEdit && (
        <>
          <TextField label="Navn" placeholder="F.eks. Trattoria Popolare" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mb-6">
            <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold block mb-1.5">
              Sted (valgfritt)
            </label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a6a5a]" />
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="By eller bydel"
                className="w-full bg-[#2a0c0f] border border-[#d4a24e]/30 rounded-lg pl-9 pr-4 py-2.5 text-[#f4e4c8] placeholder-[#8a6a5a] focus:outline-none focus:border-[#d4a24e]"
              />
            </div>
          </div>
        </>
      )}

      {isEdit ? (
        <p className="text-sm text-[#c9a876] mb-5">
          Du endrer kun dine egne vurderinger, som {myName}. De andres tall påvirkes ikke.
        </p>
      ) : (
        <div className="flex gap-2 mb-5 bg-[#2a0c0f] p-1 rounded-lg overflow-x-auto">
          {members.map((m) => (
            <button
              key={m.name}
              onClick={() => setActiveMember(m.name)}
              className={`shrink-0 px-4 py-2 rounded-md text-sm font-semibold tracking-wide transition-colors ${
                activeMember === m.name ? "bg-[#d4a24e] text-[#2a0c0f]" : "text-[#c9a876]"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {list.categories.map((c) => (
        <RatingSlider
          key={c}
          label={c}
          value={ratings[activeMember]?.[c] ?? 7}
          onChange={(v) => setR(activeMember, c, v)}
        />
      ))}

      <button
        onClick={submit}
        disabled={!isEdit && !name.trim()}
        className="w-full mt-4 bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg hover:bg-[#e0b060] transition-colors"
      >
        {isEdit ? "Lagre endringer" : "Lagre besøk"}
      </button>
    </Modal>
  );
}

function ShareModal({ list, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(list.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <Modal title="Del listen" eyebrow="Invitasjonskode" onClose={onClose}>
      <p className="text-sm text-[#c9a876] mb-5">
        Gi denne koden til de du vil skal bli med. De trykker "Bli med i liste" og skriver den inn.
      </p>
      <div className="bg-[#2a0c0f] border border-[#d4a24e]/30 rounded-xl py-6 text-center mb-4">
        <p className="font-serif text-4xl tracking-[0.2em] text-[#d4a24e]">{list.code}</p>
      </div>
      <button
        onClick={copy}
        className="w-full bg-[#d4a24e] text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg flex items-center justify-center gap-2"
      >
        {copied ? <Check size={16} /> : <Share2 size={16} />}
        {copied ? "Kopiert!" : "Kopier kode"}
      </button>
    </Modal>
  );
}

// ---------- List view ----------
function ListView({ listId, myName, onBack }) {
  const [list, setList] = useState(null);
  const [members, setMembers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null); // restaurant being edited, or null

  const refresh = async () => {
    const [l, m, r] = await Promise.all([
      getList(listId),
      getMembers(listId),
      getRestaurants(listId),
    ]);
    setList(l);
    setMembers(m);
    setRestaurants(r);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [listId]);

  const handleAdd = async (name, place, ratings) => {
    const row = await addRestaurantRow(listId, name, place, ratings);
    setRestaurants((prev) => [row, ...prev]);
  };

  const handleEdit = async (restaurantId, ratings) => {
    const updated = await updateRestaurantRatings(restaurantId, ratings);
    setRestaurants((prev) =>
      prev.map((r) => (r.id === restaurantId ? { ...r, ratings: updated?.ratings ?? ratings } : r))
    );
  };

  if (loading || !list) {
    return (
      <div className="min-h-screen bg-[#2a0c0f] flex items-center justify-center">
        <p className="text-[#8a6a5a]">Laster liste …</p>
      </div>
    );
  }

  const sorted = [...restaurants].sort((a, b) => overallAvg(b) - overallAvg(a));

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        body { font-family: 'Inter', sans-serif; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #f4e4c8;
          border: 2px solid #d4a24e;
          cursor: pointer;
        }
      `}</style>

      <div className="px-6 pt-8 pb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#d4a24e]/10 blur-2xl" />
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-[#c9a876] flex items-center gap-1 text-sm">
            <ArrowLeft size={15} /> Mine lister
          </button>
          <button onClick={() => setShowShare(true)} className="text-[#d4a24e] flex items-center gap-1 text-sm font-semibold">
            <Share2 size={14} /> Del
          </button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] mb-2 flex items-center gap-1.5">
          <Utensils size={12} /> {list.name}
        </p>
        <h1 className="font-serif text-3xl leading-tight text-[#f4e4c8]">
          Steder dere har<br />spist godt.
        </h1>
        <div className="flex items-center gap-2 mt-3 text-xs text-[#c9a876]">
          <Users size={13} />
          <span>{members.map((m) => m.name).join(", ") || "Ingen medlemmer ennå"}</span>
        </div>
      </div>

      <div className="px-4 pb-28">
        {sorted.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Sparkles className="mx-auto mb-3 text-[#d4a24e]/50" size={28} />
            <p className="font-serif text-xl text-[#f4e4c8]/80 mb-1">Ingen restauranter ennå</p>
            <p className="text-sm text-[#8a6a5a]">Legg til det første stedet dere spiste sammen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((r, i) => {
              const avg = overallAvg(r);
              const isOpen = expanded === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="bg-[#3a1014] rounded-2xl px-5 py-4 border border-[#d4a24e]/15 active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="font-serif text-lg text-[#d4a24e]/50 pt-0.5 w-6 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-serif text-xl text-[#f4e4c8] truncate">{r.name}</h3>
                        {r.place && (
                          <p className="text-xs text-[#8a6a5a] flex items-center gap-1 mt-0.5">
                            <MapPin size={11} /> {r.place}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <div className="flex items-center gap-1 text-[#d4a24e]">
                        <Star size={14} fill="#d4a24e" strokeWidth={0} />
                        <span className="font-serif text-2xl leading-none">{avg.toFixed(1)}</span>
                      </div>
                      <span className="text-[9px] uppercase tracking-widest text-[#8a6a5a] mt-1">
                        snitt
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-[#d4a24e]/15">
                      <div className="flex flex-wrap justify-around gap-y-3 mb-4">
                        {members.map((m) => (
                          <Stamp key={m.name} initial={initials(m.name)} value={personAvg(r, m.name)} />
                        ))}
                      </div>
                      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${list.categories.length}, minmax(0,1fr))` }}>
                        {list.categories.map((c) => {
                          const v = categoryAvg(r, c);
                          return (
                            <div key={c} className="text-center bg-[#2a0c0f] rounded-lg py-2">
                              <p className="text-[9px] uppercase tracking-widest text-[#8a6a5a] mb-1">{c}</p>
                              <p className="font-serif text-sm text-[#f4e4c8]">{v === null ? "–" : v.toFixed(1)}</p>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(r);
                        }}
                        className="w-full mt-3 text-[#d4a24e] border border-[#d4a24e]/30 text-xs font-semibold uppercase tracking-widest py-2.5 rounded-lg"
                      >
                        Rediger mine vurderinger
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#d4a24e] text-[#2a0c0f] shadow-lg shadow-black/40 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {showAdd && (
        <AddForm list={list} members={members} myName={myName} onAdd={handleAdd} onClose={() => setShowAdd(false)} />
      )}
      {editing && (
        <AddForm
          list={list}
          members={members}
          myName={myName}
          editRestaurant={editing}
          onEdit={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {showShare && <ShareModal list={list} onClose={() => setShowShare(false)} />}
    </div>
  );
}

// ---------- Root ----------
export default function App() {
  const [active, setActive] = useState(null); // { listId, myName }

  if (!active) {
    return <Landing onEnter={(listId, myName) => setActive({ listId, myName })} />;
  }

  return <ListView listId={active.listId} myName={active.myName} onBack={() => setActive(null)} />;
}
