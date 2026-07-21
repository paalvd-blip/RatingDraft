import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Plus,
  X,
  MapPin,
  Utensils,
  Users,
  Sparkles,
  Star,
  ArrowLeft,
  Share2,
  Check,
  RefreshCw,
  Pencil,
  LogOut,
  Mail,
  Lock,
  User,
  Settings,
  Trash2,
} from "lucide-react";

// ---- Supabase config ----
const SUPABASE_URL = "https://rmrukmijuepsbehlntak.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtcnVrbWlqdWVwc2JlaGxudGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMTI3NjAsImV4cCI6MjA5OTg4ODc2MH0.HAWxs-jI20_pGl_IoR7m1hzRDszd5nIQZXvtdQ1bqVs";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const DEFAULT_CATEGORIES = ["Mat", "Service", "Stemning"];

// ---------- Data layer ----------

async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function createProfile(userId, displayName) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fetchMyLists(userId) {
  const { data, error } = await supabase
    .from("list_members")
    .select("joined_at, lists(id, name, code, categories)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.lists).filter(Boolean);
}

async function createList(name, categories, ownerId) {
  const code = genCode();
  const { data: list, error } = await supabase
    .from("lists")
    .insert({ name, code, categories, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;
  const { error: memberError } = await supabase
    .from("list_members")
    .insert({ list_id: list.id, user_id: ownerId });
  if (memberError) throw memberError;
  return list;
}

async function findListByCode(code) {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function joinList(listId, userId) {
  const { error } = await supabase.from("list_members").insert({ list_id: listId, user_id: userId });
  // 23505 = unique_violation, meaning they're already a member — that's fine, not an error.
  if (error && error.code !== "23505") throw error;
}

async function getList(id) {
  const { data, error } = await supabase.from("lists").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function getListMembers(listId) {
  const { data, error } = await supabase
    .from("list_members")
    .select("user_id, profiles(display_name)")
    .eq("list_id", listId);
  if (error) throw error;
  return (data || []).map((row) => ({
    userId: row.user_id,
    name: row.profiles?.display_name || "Ukjent",
  }));
}

async function getRestaurants(listId) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function addRestaurantRow(listId, name, place, ratings) {
  const { data, error } = await supabase
    .from("restaurants")
    .insert({ list_id: listId, name, place, ratings })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateRestaurantInfo(restaurantId, name, place) {
  const { data, error } = await supabase
    .from("restaurants")
    .update({ name, place })
    .eq("id", restaurantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Merge just the current user's category scores into the existing ratings object
async function updateMyRatings(restaurantId, userId, categoryScores) {
  const { data: current, error: fetchError } = await supabase
    .from("restaurants")
    .select("ratings")
    .eq("id", restaurantId)
    .single();
  if (fetchError) throw fetchError;
  const nextRatings = { ...(current.ratings || {}), [userId]: categoryScores };
  const { data, error } = await supabase
    .from("restaurants")
    .update({ ratings: nextRatings })
    .eq("id", restaurantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateListName(listId, name) {
  const { data, error } = await supabase.from("lists").update({ name }).eq("id", listId).select().single();
  if (error) throw error;
  return data;
}

async function deleteList(listId) {
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) throw error;
}

async function deleteRestaurant(restaurantId) {
  const { error } = await supabase.from("restaurants").delete().eq("id", restaurantId);
  if (error) throw error;
}

async function removeMember(listId, userId) {
  const { error } = await supabase.from("list_members").delete().eq("list_id", listId).eq("user_id", userId);
  if (error) throw error;
}

// ---------- Rating math ----------
// ratings shape: { [userId]: { [category]: number } }
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

function personAvg(r, userId) {
  const catMap = (r.ratings || {})[userId];
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
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

// ================= Shared UI =================

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
        <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold">{label}</label>
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
            {eyebrow && <p className="text-[10px] uppercase tracking-[0.2em] text-[#d4a24e] mb-1">{eyebrow}</p>}
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

function RenameModal({ title, eyebrow, label, initialValue, onSave, onClose }) {
  const [value, setValue] = useState(initialValue);
  return (
    <Modal title={title} eyebrow={eyebrow} onClose={onClose}>
      <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        onClick={() => {
          if (!value.trim()) return;
          onSave(value.trim());
          onClose();
        }}
        disabled={!value.trim()}
        className="w-full mt-1 bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
      >
        Lagre
      </button>
    </Modal>
  );
}

function GlobalStyle() {
  return (
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
  );
}

const SAFE_TOP = { paddingTop: "max(2.5rem, calc(env(safe-area-inset-top) + 1.25rem))" };
const SAFE_TOP_TALL = { paddingTop: "max(3.5rem, calc(env(safe-area-inset-top) + 2rem))" };
const SAFE_BOTTOM = { bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" };

// ================= Auth =================

function AuthScreen() {
  const [tab, setTab] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleLogin = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === "Invalid login credentials" ? "Feil e-post eller passord." : error.message);
    setBusy(false);
  };

  const handleSignup = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setError(error.message);
    } else if (!data.session) {
      setNotice("Konto opprettet! Sjekk e-posten din for en bekreftelseslenke, og logg deretter inn.");
      setTab("login");
    }
    setBusy(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Skriv inn e-posten din over først.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) setError(error.message);
    else setNotice("Vi har sendt deg en lenke for å tilbakestille passordet.");
  };

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8] px-6 pb-10" style={SAFE_TOP_TALL}>
      <GlobalStyle />
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] mb-2 flex items-center gap-1.5">
        <Utensils size={12} /> Restaurantlister
      </p>
      <h1 className="font-serif text-4xl leading-tight text-[#f4e4c8] mb-8">
        Steder dere har
        <br />
        spist godt.
      </h1>

      <div className="flex gap-2 mb-6 bg-[#3a1014] p-1 rounded-lg">
        <button
          onClick={() => {
            setTab("login");
            setError("");
            setNotice("");
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-semibold tracking-wide transition-colors ${
            tab === "login" ? "bg-[#d4a24e] text-[#2a0c0f]" : "text-[#c9a876]"
          }`}
        >
          Logg inn
        </button>
        <button
          onClick={() => {
            setTab("signup");
            setError("");
            setNotice("");
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-semibold tracking-wide transition-colors ${
            tab === "signup" ? "bg-[#d4a24e] text-[#2a0c0f]" : "text-[#c9a876]"
          }`}
        >
          Opprett konto
        </button>
      </div>

      <TextField
        label="E-post"
        icon={<Mail size={16} />}
        type="email"
        placeholder="deg@eksempel.no"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <TextField
        label="Passord"
        icon={<Lock size={16} />}
        type="password"
        placeholder="Minst 6 tegn"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={tab === "login" ? "current-password" : "new-password"}
      />

      {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
      {notice && <p className="text-[#d4a24e] text-sm mb-3">{notice}</p>}

      {tab === "login" ? (
        <>
          <button
            onClick={handleLogin}
            disabled={busy || !email.trim() || !password}
            className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
          >
            {busy ? "Logger inn …" : "Logg inn"}
          </button>
          <button onClick={handleForgotPassword} className="w-full text-center text-[#c9a876] text-sm mt-4">
            Glemt passord?
          </button>
        </>
      ) : (
        <button
          onClick={handleSignup}
          disabled={busy || !email.trim() || password.length < 6}
          className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
        >
          {busy ? "Oppretter …" : "Opprett konto"}
        </button>
      )}
    </div>
  );
}

function ProfileSetup({ userId, onDone }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const profile = await createProfile(userId, name.trim());
      onDone(profile);
    } catch (e) {
      setError(e?.message ? `Klarte ikke lagre: ${e.message}` : "Klarte ikke lagre navnet. Prøv igjen.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8] px-6 pb-10" style={SAFE_TOP_TALL}>
      <GlobalStyle />
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] mb-2 flex items-center gap-1.5">
        <Sparkles size={12} /> Nesten klar
      </p>
      <h1 className="font-serif text-3xl leading-tight text-[#f4e4c8] mb-6">Hva skal du hete i listene dine?</h1>
      <TextField label="Visningsnavn" icon={<User size={16} />} placeholder="F.eks. Pål Vegard" value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
      <button
        onClick={save}
        disabled={busy || !name.trim()}
        className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
      >
        {busy ? "Lagrer …" : "Fortsett"}
      </button>
    </div>
  );
}

// ================= Landing (list picker) =================

function Landing({ userId, displayName, onEnter, onSignOut }) {
  const [mode, setMode] = useState(null); // 'create' | 'join' | null
  const [myLists, setMyLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [listName, setListName] = useState("");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    fetchMyLists(userId)
      .then(setMyLists)
      .catch(() => {})
      .finally(() => setLoadingLists(false));
  }, [userId]);

  const updateCategory = (i, val) => {
    const next = [...categories];
    next[i] = val;
    setCategories(next);
  };
  const addCategory = () => setCategories([...categories, ""]);
  const removeCategory = (i) => setCategories(categories.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!listName.trim()) return;
    const cleanCats = categories.map((c) => c.trim()).filter(Boolean);
    if (!cleanCats.length) return;
    setBusy(true);
    setError("");
    try {
      const list = await createList(listName.trim(), cleanCats, userId);
      onEnter(list.id);
    } catch (e) {
      setError(e?.message ? `Klarte ikke opprette listen: ${e.message}` : "Klarte ikke opprette listen.");
    }
    setBusy(false);
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const list = await findListByCode(code.trim());
      if (!list) {
        setError("Fant ingen liste med den koden.");
        setBusy(false);
        return;
      }
      await joinList(list.id, userId);
      onEnter(list.id);
    } catch (e) {
      setError(e?.message ? `Noe gikk galt: ${e.message}` : "Noe gikk galt. Prøv igjen.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8] px-6 pb-10" style={SAFE_TOP_TALL}>
      <GlobalStyle />
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] flex items-center gap-1.5">
          <Utensils size={12} /> Restaurantlister
        </p>
        <button onClick={onSignOut} className="text-[#c9a876] flex items-center gap-1 text-xs">
          <LogOut size={13} /> Logg ut
        </button>
      </div>
      <h1 className="font-serif text-4xl leading-tight text-[#f4e4c8] mb-1">
        Hei, {displayName}.
      </h1>
      <p className="text-sm text-[#c9a876] mb-8">Lag en liste eller bli med i en du har fått kode til.</p>

      {!loadingLists && myLists.length > 0 && !mode && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[#8a6a5a] mb-2">Dine lister</p>
          <div className="space-y-2">
            {myLists.map((l) => (
              <button
                key={l.id}
                onClick={() => onEnter(l.id)}
                className="w-full text-left bg-[#3a1014] rounded-xl px-4 py-3.5 border border-[#d4a24e]/15 flex items-center justify-between"
              >
                <div>
                  <p className="font-serif text-lg text-[#f4e4c8]">{l.name}</p>
                  <p className="text-xs text-[#8a6a5a]">kode {l.code}</p>
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
            disabled={busy || !listName.trim()}
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
          {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={busy || !code.trim()}
            className="w-full bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg"
          >
            {busy ? "Blir med …" : "Bli med i listen"}
          </button>
        </div>
      )}
    </div>
  );
}

// ================= Add / edit restaurant =================
// Ratings entered here always belong to the logged-in user.
function AddForm({ list, editRestaurant, userId, onAdd, onEdit, onClose }) {
  const isEdit = Boolean(editRestaurant);
  const [name, setName] = useState(editRestaurant?.name || "");
  const [place, setPlace] = useState(editRestaurant?.place || "");
  const [scores, setScores] = useState(() => {
    const init = {};
    list.categories.forEach((c) => {
      init[c] = editRestaurant?.ratings?.[userId]?.[c] ?? 7;
    });
    return init;
  });
  const [busy, setBusy] = useState(false);

  const setScore = (cat, val) => setScores((prev) => ({ ...prev, [cat]: val }));

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    if (isEdit) {
      await onEdit(editRestaurant.id, name.trim(), place.trim(), scores);
    } else {
      await onAdd(name.trim(), place.trim(), scores);
    }
    setBusy(false);
    onClose();
  };

  return (
    <Modal title={isEdit ? "Rediger restaurant" : "Legg til restaurant"} eyebrow={isEdit ? "Rediger besøk" : "Nytt besøk"} onClose={onClose}>
      <TextField label="Navn" placeholder="F.eks. Trattoria Popolare" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="mb-6">
        <label className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold block mb-1.5">Sted (valgfritt)</label>
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

      <p className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold mb-3">Dine vurderinger</p>
      {list.categories.map((c) => (
        <RatingSlider key={c} label={c} value={scores[c] ?? 7} onChange={(v) => setScore(c, v)} />
      ))}

      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="w-full mt-4 bg-[#d4a24e] disabled:opacity-40 text-[#2a0c0f] font-bold uppercase tracking-widest text-sm py-3.5 rounded-lg hover:bg-[#e0b060] transition-colors"
      >
        {busy ? "Lagrer …" : isEdit ? "Lagre endringer" : "Lagre besøk"}
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
        Gi denne koden til de du vil skal bli med. De oppretter konto eller logger inn, trykker "Bli med i liste" og skriver den inn.
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

function AdminModal({ list, members, ownerId, onRemoveMember, onDeleteList, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [deletingList, setDeletingList] = useState(false);

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Fjerne ${name} fra listen?`)) return;
    setBusyId(userId);
    await onRemoveMember(userId);
    setBusyId(null);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Slette hele listen "${list.name}"? Dette kan ikke angres, og alle restauranter forsvinner.`)) return;
    setDeletingList(true);
    await onDeleteList();
  };

  return (
    <Modal title="Administrer liste" eyebrow={list.name} onClose={onClose}>
      <p className="text-xs uppercase tracking-widest text-[#c9a876] font-semibold mb-3">Medlemmer</p>
      <div className="space-y-2 mb-6">
        {members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between bg-[#2a0c0f] rounded-lg px-4 py-3 border border-[#d4a24e]/15"
          >
            <span className="font-serif text-lg text-[#f4e4c8]">
              {m.name}
              {m.userId === ownerId && (
                <span className="ml-2 text-[9px] uppercase tracking-widest text-[#d4a24e] align-middle">Eier</span>
              )}
            </span>
            {m.userId !== ownerId && (
              <button
                onClick={() => handleRemove(m.userId, m.name)}
                disabled={busyId === m.userId}
                className="text-[#c9a876] p-1 disabled:opacity-40"
                aria-label={`Fjern ${m.name}`}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs uppercase tracking-widest text-red-300/80 font-semibold mb-3">Faresone</p>
      <button
        onClick={handleDelete}
        disabled={deletingList}
        className="w-full flex items-center justify-center gap-2 bg-transparent border border-red-400/40 text-red-300 disabled:opacity-40 font-semibold uppercase tracking-widest text-sm py-3.5 rounded-lg"
      >
        <Trash2 size={15} />
        {deletingList ? "Sletter …" : "Slett listen"}
      </button>
    </Modal>
  );
}

// ================= List view =================

function ListView({ listId, userId, myName, onBack }) {
  const [list, setList] = useState(null);
  const [members, setMembers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailMember, setDetailMember] = useState(null);
  const [renamingList, setRenamingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const [loadError, setLoadError] = useState("");

  const refresh = async () => {
    setLoadError("");
    try {
      const [l, m, r] = await Promise.all([getList(listId), getListMembers(listId), getRestaurants(listId)]);
      setList(l);
      setMembers(m);
      setRestaurants(r);
    } catch (e) {
      setLoadError(e?.message || "Klarte ikke laste listen.");
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
  }, [listId]);

  const handleAdd = async (name, place, scores) => {
    const row = await addRestaurantRow(listId, name, place, { [userId]: scores });
    setRestaurants((prev) => [row, ...prev]);
  };

  const handleEdit = async (restaurantId, name, place, scores) => {
    await updateRestaurantInfo(restaurantId, name, place);
    const updated = await updateMyRatings(restaurantId, userId, scores);
    setRestaurants((prev) => prev.map((r) => (r.id === restaurantId ? updated : r)));
  };

  const handleRenameList = async (newName) => {
    const updated = await updateListName(listId, newName);
    setList(updated);
  };

  const handleDeleteRestaurant = async (restaurantId) => {
    if (!window.confirm("Slette dette restaurantbesøket? Dette kan ikke angres.")) return;
    await deleteRestaurant(restaurantId);
    setRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
    setExpanded((cur) => (cur === restaurantId ? null : cur));
  };

  const handleRemoveMember = async (userId) => {
    await removeMember(listId, userId);
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  const handleDeleteList = async () => {
    await deleteList(listId);
    onBack();
  };

  if (loading || (!list && !loadError)) {
    return (
      <div className="min-h-screen bg-[#2a0c0f] flex items-center justify-center">
        <GlobalStyle />
        <p className="text-[#8a6a5a]">Laster liste …</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#2a0c0f] flex flex-col items-center justify-center px-6 text-center">
        <GlobalStyle />
        <p className="text-red-300 mb-4">{loadError}</p>
        <button onClick={onBack} className="text-[#d4a24e] text-sm underline">
          Tilbake til mine lister
        </button>
      </div>
    );
  }

  const sorted = [...restaurants].sort((a, b) => overallAvg(b) - overallAvg(a));

  return (
    <div className="min-h-screen bg-[#2a0c0f] text-[#f4e4c8]">
      <GlobalStyle />

      <div className="px-6 pb-6 relative overflow-hidden" style={SAFE_TOP}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#d4a24e]/10 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-[#c9a876] flex items-center gap-1 text-sm">
            <ArrowLeft size={15} /> Mine lister
          </button>
          <div className="flex items-center gap-4">
            <button onClick={handleRefresh} className="text-[#c9a876] flex items-center gap-1 text-sm" aria-label="Oppdater">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowShare(true)} className="text-[#d4a24e] flex items-center gap-1 text-sm font-semibold">
              <Share2 size={14} /> Del
            </button>
            {list.owner_id === userId && (
              <button onClick={() => setShowAdmin(true)} className="text-[#c9a876]" aria-label="Administrer liste">
                <Settings size={14} />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setRenamingList(true)}
          className="text-[11px] uppercase tracking-[0.3em] text-[#d4a24e] mb-2 flex items-center gap-1.5"
        >
          <Utensils size={12} /> {list.name} <Pencil size={11} className="opacity-60" />
        </button>
        <h1 className="font-serif text-3xl leading-tight text-[#f4e4c8]">
          Steder dere har
          <br />
          spist godt.
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
                  onClick={() => {
                    setExpanded(isOpen ? null : r.id);
                    setDetailMember(null);
                  }}
                  className="bg-[#3a1014] rounded-2xl px-5 py-4 border border-[#d4a24e]/15 active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="font-serif text-lg text-[#d4a24e]/50 pt-0.5 w-6 shrink-0 text-right">{i + 1}</span>
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
                      <span className="text-[9px] uppercase tracking-widest text-[#8a6a5a] mt-1">snitt</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-[#d4a24e]/15">
                      <div className="flex flex-wrap justify-around gap-y-3 mb-4">
                        {members.map((m) => (
                          <button
                            key={m.userId}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailMember(detailMember === m.userId ? null : m.userId);
                            }}
                            className={`rounded-xl transition-opacity ${
                              detailMember && detailMember !== m.userId ? "opacity-40" : ""
                            }`}
                          >
                            <Stamp initial={initials(m.name)} value={personAvg(r, m.userId)} />
                          </button>
                        ))}
                      </div>

                      <p className="text-[9px] uppercase tracking-widest text-[#8a6a5a] mb-2 text-center">
                        {detailMember ? `${members.find((m) => m.userId === detailMember)?.name}s vurdering` : "Snitt for gruppen"}
                      </p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${list.categories.length}, minmax(0,1fr))` }}>
                        {list.categories.map((c) => {
                          const v = detailMember ? (r.ratings || {})[detailMember]?.[c] ?? null : categoryAvg(r, c);
                          return (
                            <div key={c} className="text-center bg-[#2a0c0f] rounded-lg py-2">
                              <p className="text-[9px] uppercase tracking-widest text-[#8a6a5a] mb-1">{c}</p>
                              <p className="font-serif text-sm text-[#f4e4c8]">{v === null || v === undefined ? "–" : v.toFixed(1)}</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(r);
                          }}
                          className="flex-1 text-[#d4a24e] border border-[#d4a24e]/30 text-xs font-semibold uppercase tracking-widest py-2.5 rounded-lg"
                        >
                          Rediger sted og mine vurderinger
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRestaurant(r.id);
                          }}
                          className="text-red-300 border border-red-400/30 px-3.5 rounded-lg"
                          aria-label="Slett restaurant"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
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
        className="fixed right-6 w-14 h-14 rounded-full bg-[#d4a24e] text-[#2a0c0f] shadow-lg shadow-black/40 flex items-center justify-center active:scale-95 transition-transform"
        style={SAFE_BOTTOM}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {showAdd && <AddForm list={list} userId={userId} onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
      {editing && (
        <AddForm list={list} userId={userId} editRestaurant={editing} onEdit={handleEdit} onClose={() => setEditing(null)} />
      )}
      {showShare && <ShareModal list={list} onClose={() => setShowShare(false)} />}
      {renamingList && (
        <RenameModal
          title="Gi listen nytt navn"
          eyebrow="Rediger liste"
          label="Navn på liste"
          initialValue={list.name}
          onSave={handleRenameList}
          onClose={() => setRenamingList(false)}
        />
      )}
      {showAdmin && (
        <AdminModal
          list={list}
          members={members}
          ownerId={list.owner_id}
          onRemoveMember={handleRemoveMember}
          onDeleteList={handleDeleteList}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  );
}

// ================= Root =================

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(undefined);
  const [active, setActive] = useState(null); // listId or null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(undefined);
        setActive(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null || session === undefined) return;
    fetchProfile(session.user.id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [session]);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#2a0c0f] flex items-center justify-center">
        <GlobalStyle />
        <p className="text-[#8a6a5a]">Laster …</p>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-[#2a0c0f] flex items-center justify-center">
        <GlobalStyle />
        <p className="text-[#8a6a5a]">Laster …</p>
      </div>
    );
  }

  if (!profile) {
    return <ProfileSetup userId={session.user.id} onDone={setProfile} />;
  }

  if (!active) {
    return (
      <Landing
        userId={session.user.id}
        displayName={profile.display_name}
        onEnter={(listId) => setActive(listId)}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <ListView
      listId={active}
      userId={session.user.id}
      myName={profile.display_name}
      onBack={() => setActive(null)}
    />
  );
}
