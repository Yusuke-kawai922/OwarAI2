"use client";
import React, { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import type { PanInfo } from "framer-motion";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Share2,
  Trophy,
  Vote as VoteIcon,
  Flame,
  LogIn,
  LogOut,
  Send,
  Copy,
  PlusCircle,
  Search,
  ChevronRight,
  Tag,
} from "lucide-react";

/**
 * OwarAI – 3秒返し MVP（ブランド版）
 * - ユーザーによるお題追加は不可（運営のみ）。このプレビューでは常に無効化。
 * - 起動スプラッシュはプレビュー簡略化のためデフォルトOFF。
 */

// ====== ブランド/設定 ======
const APP_NAME = "OwarAI";
const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://example.com";
const LOGO_PNG = "/owarai-logo.png"; // なくても動作します（ロゴ未表示）
const LOGO_MP4 = "/owarai-logo.mp4"; // なくても動作します（スプラッシュ自動スキップ）

// ====== 採点ファミリー ======
type Family = "air" | "character" | "before_after" | "creative";

// ====== 型定義 ======
interface UserProfile { id: string; handle: string; university?: string }
interface Prompt { id: number; title: string; body: string; family: Family; leagueWeek: number; tags?: string[] }
interface Submission { id: number; promptId: number; userId: string; content: string; categoryGuess: string; ruleScore: number; ngFlag: boolean; createdAt: number }
interface Vote { id: number; submissionId: number; voterId: string; score: 1|2|3; createdAt: number }
interface OnPostedFn { (s: Submission): void }

type PromptDraft = { title: string; body: string; family: Family; leagueWeek: number; tags?: string[] };

// ====== ローカルストレージ ======
const storage = {
  get<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback } },
  set<T>(key: string, v: T) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} },
  remove(key: string) { try { localStorage.removeItem(key) } catch {} },
};

// ====== NG辞書（簡易） ======
const NG_WORDS: string[] = ["死ね","殺す","差別","レイプ","実名中傷","個人情報","障害","ブス","きもい"];
const hitNG = (text: string) => NG_WORDS.some((w) => normalize(text).includes(w));

// ====== 正規化/サブロジック ======
function normalize(text: string){ return text.replace(/[\s\n\r\t]+/g, " ").trim(); }
function hasTooManyRepeats(t: string){ const words=t.split(/\s+/); const f:Record<string,number>={}; for(const w of words){ f[w]=(f[w]||0)+1 } return Object.values(f).some(c=>c>=3) }
function hasRepeatedNgram(t: string, minN: number, maxN: number, times: number){ const words=t.split(/\s+/); for(let n=minN;n<=maxN;n++){ const m=new Map<string,number>(); for(let i=0;i<=words.length-n;i++){ const k=words.slice(i,i+n).join(" "); m.set(k,(m.get(k)||0)+1) } for(const v of m.values()) if(v>=times) return true } return false }

// ====== 採点（ファミリー別ルール） ======
function scoreByFamily(text: string, family: Family){
  const t = normalize(text); const len = t.length; let score = 0; let guess = "";
  if (len>=10 && len<=90) score += 10; else score -= 5;
  if (/[!?…]$/.test(t)) score += 3;
  const punct = (t.match(/[。\.]{2,}|、{2,}|!{2,}|\?{2,}/g)||[]).length; if (punct===0) score += 2; else score -= 3;
  if (family === "air"){ const empathy=/(無理すんな|休もう|安全第一|交代|サービスエリア|水|一旦止まろ|コーヒー|飴|ガム|窓|換気|BGM|歌う)/; const agree=/(それな|わかる|分かりみ|だよね|同じ気持ち)/; const reveal=/(実は|ぶっちゃけ|正直|ほんとは)/; if (empathy.test(t)){ score+=18; guess="粋（労わり）" } else if (agree.test(t)){ score+=12; guess="同調" } else if (reveal.test(t)){ score+=12; guess="カミングアウト" } else if (/(つまり|全体的に|この空気|今日の流れ|みんな)/.test(t)){ score+=8; guess="俯瞰/深読み" } }
  if (family === "character"){ if (/(最高|神|世界一|完璧|間違いない)/.test(t)){ score+=12; guess="建前（オーバー）" } else if (/(恐れ入ります|土下座|申し訳|平に|許して)/.test(t)){ score+=12; guess="恐縮" } else if (/(レディ|エスコート|お嬢さん|任せて)/.test(t)){ score+=12; guess="キザ" } else if (/(大丈夫俺|まだいける|自分を信じろ|次は勝てる)/.test(t)){ score+=12; guess="自分フォロー" } else if (/(ついでに|せっかくだし|奢って|ちょっとだけ)/.test(t)){ score+=10; guess="便乗" } else if (/(余裕|問題なし|想定内)/.test(t)){ score+=8; guess="強がり" } }
  if (family === "before_after"){ if (/(先に言うと|正直|前置きだけど|ぶっちゃけ)/.test(t)){ score+=12; guess="前置き" } else if (/(いや俺かい|言い過ぎ|やり過ぎた|自分で突っ込む)/.test(t)){ score+=12; guess="自分ツッコミ" } else if (/(じゃあ俺が|話変えるけど|ここからは)/.test(t)){ score+=12; guess="切り替え" } else if (/(と思うじゃん|かと思いきや|実は逆で)/.test(t)){ score+=12; guess="裏切り" } else if (/(実は用意してた|まさかの|サプライズ)/.test(t)){ score+=12; guess="サプライズ" } }
  if (family === "creative"){ if (/(PPAP|倍返し|今でしょ|逃げちゃダメだ)/.test(t)){ score+=14; guess="パロディ" } else if (/(車|ハンドル|タイヤ|ナビ)が(眠い|喋った|怒ってる)/.test(t)){ score+=12; guess="擬人化" } else if (/(\S+界の\S+)/.test(t)){ score+=10; guess="レッテル展開" } else if (/(戦国|宇宙|量子|経済指標|KPI)/.test(t)){ score+=10; guess="ミスマッチ" } else if (hasRepeatedNgram(t,2,5,2)){ score+=12; guess="天丼" } else if (/(して).*(して)/.test(t)){ score+=8; guess="韻/反復" } }
  if (/お願いします|しよう|しよ/.test(t)) score += 2; if (/(ごめん|すまん|すみません)/.test(t)) score += 2; if (hasTooManyRepeats(t)) score -= 6;
  return { score: Math.min(100, Math.max(0, score)), guess };
}

// ====== デモ用お題 ======
const seedPrompts: Prompt[] = [
  { id: 1, title: "ドライブ中、相手が『眠くなってきた…』と言ってきた", body: "安全第一＆空気を和ませる切り返し", family: "air",          leagueWeek: 1, tags: ["ドライブ","気遣い","安全"] },
  { id: 2, title: "初対面の自己紹介、相手が終えた直後",                   body: "相手の面白さに気づいて拾う・粋な共感",           family: "air",          leagueWeek: 1, tags: ["初対面","自己紹介","共感"] },
  { id: 3, title: "会議で重い沈黙が流れた",                               body: "悪い空気の共有→切り返し（前後/カウンター）",     family: "before_after", leagueWeek: 1, tags: ["会議","沈黙","切り返し"] },
  { id: 4, title: "デートで相手が『お腹すいた』",                          body: "キャラで便乗 or 粋なエスコート",                 family: "character",    leagueWeek: 1, tags: ["デート","食事","エスコート"] },
  { id: 5, title: "友だちが失敗して落ち込んでいる",                        body: "自分フォロー/粋/サプライズで救う",              family: "creative",     leagueWeek: 1, tags: ["励まし","失敗","サプライズ"] },
];

function makeShareUrl(submissionId: number){ return `${APP_ORIGIN}/p/${submissionId}` }

// タグ正規化/解析
function normalizeTag(t: string){ return t.replace(/^#/, "").trim().toLowerCase(); }
 function parseTags(text: string) {
   return Array.from(new Set(
     text.split(/[,、\s\u3000]+/).map(normalizeTag).filter(Boolean)
   ));
 }

// ====== UI 基礎 ======
function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }){
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className || "bg-amber-600 text-amber-50"}`}>{children}</span>
}
function Button({ children, onClick, variant = "primary", disabled }:{
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ghost"; disabled?: boolean;
}){
  const base =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-sm font-medium " +
    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-50";
  const styles = {
    primary: "bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700",
    outline: "bg-white text-amber-900 border border-amber-200 hover:bg-amber-50",
    ghost:   "text-amber-900 hover:bg-amber-100/60"
  } as const;
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}
function Card(
  props: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string }
) {
  const { className = "", children, ...rest } = props;
  return (
    <div
      {...rest}
      className={`rounded-xl bg-white border border-amber-100/60
                  shadow-[0_1px_2px_rgba(16,24,40,.06),0_8px_24px_rgba(16,24,40,.08)] ${className}`}
    >
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder }:{
  value: string; onChange: (v: string) => void; placeholder?: string
}){
  return (
    <input
      value={value}
      onChange={e=>onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 rounded-lg bg-white border border-amber-200 px-3 text-sm
                 text-amber-900 placeholder-amber-400
                 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
    />
  );
}

// ref 対応 TextArea
const TextArea = React.forwardRef<HTMLTextAreaElement,
  { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }
>(({ value, onChange, rows = 3, placeholder }, ref) => {
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm
                 text-amber-900 placeholder-amber-400
                 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
    />
  );
});
TextArea.displayName = "TextArea";

function useToast(){
  const [msg,setMsg]=useState<string|null>(null);
  const show=(m:string)=>{ setMsg(m); setTimeout(()=>setMsg(null),2200) };
  const ui=(
    <AnimatePresence>
      {msg && (
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}} className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 text-amber-900 px-4 py-2 rounded-xl shadow-lg">
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return {show,ui};
}

// ====== 擬似バックエンド ======
const _submissions: Submission[] = []; // ← let を const に
let _votes: Vote[] = [];               // ← これは再代入しているので let のまま
let idCounter = 1000;


function seedDemo(){ if (_submissions.length>0) return; const ai={ id:"ai-sample", handle:"AIサンプル" };
  const samples: Array<{p:number; family:Family; text:string}> = [
    { p:1, family:"air", text:"眠い？ 無理すんな、安全第一。次のSAで交代しよ。BGMは起きろ起きろラジオにチェンジ！" },
    { p:1, family:"creative", text:"ハンドルが言ってる『俺まで眠い』って。いったんコーヒーで仲裁しよう。" },
    { p:2, family:"air", text:"自己紹介うまっ。その“間”、面接で貸して？（ロイヤリティは缶コーヒーでOK）" },
    { p:3, family:"before_after", text:"正直、この沈黙プレミア。じゃあ一回だけ僕が滑ります——今日も元気に！" },
    { p:4, family:"character", text:"お腹すいた？レディの胃袋は私の管轄です。最短ルートで美味いの連れてく。" },
    { p:5, family:"creative", text:"失敗？それ“経験ポイント”って言うんだよ。今レベルアップ音、鳴ったよね。" },
  ];
  samples.forEach(x=>{ const {score, guess}=scoreByFamily(x.text, x.family); _submissions.push({ id:idCounter++, promptId:x.p, userId:ai.id, content:x.text, categoryGuess:guess, ruleScore:score, ngFlag:false, createdAt:Date.now()-Math.floor(Math.random()*86400000) }) })
}
function upsertSubmission(s: Omit<Submission, "id"|"createdAt">){ const id=idCounter++; const createdAt=Date.now(); const sub:{id:number}&Submission = { id, createdAt, ...s } as Submission; _submissions.push(sub); return sub }
function listSubmissionsByPrompt(promptId:number){ return _submissions.filter(s=>s.promptId===promptId) }
function listOthersForVoting(currentUserId:string){ return _submissions.filter(s=>s.userId!==currentUserId) }
function castVote(v: Omit<Vote,"id"|"createdAt">){ const id=idCounter++; const createdAt=Date.now(); const vote:Vote={id,createdAt,...v}; _votes=_votes.filter(x=>!(x.submissionId===v.submissionId && x.voterId===v.voterId)).concat(vote); return vote }
function aggregateFor(submissionId:number){ const votes=_votes.filter(v=>v.submissionId===submissionId); const totalVotes=votes.length; const avg= totalVotes? (votes.reduce((a,b)=>a+b.score,0)/totalVotes):0; return { totalVotes, avgScore:+avg.toFixed(2) } }

// ====== スプラッシュ（簡略） ======
function SplashIntro({ onDone }: { onDone: () => void }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setTimeout(() => { setShow(false); onDone(); }, 400);
    }
  }, [onDone]);
  if (!show) return null;
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="fixed inset-0 z-[100] overflow-hidden" style={{ background: "linear-gradient(180deg,#FFD067 0%,#FFC043 45%,#FFAE1A 100%)" }}>
        <VideoOrLogo onEnd={() => { setShow(false); onDone(); }} />
      </motion.div>
    </AnimatePresence>
  );
}
function VideoOrLogo({ onEnd }: { onEnd: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const done = () => onEnd(); const ready = () => setVideoReady(true);
    v.addEventListener("ended", done); v.addEventListener("error", done); v.addEventListener("canplay", ready);
    const t = setTimeout(done, 1800);
    return () => { v.removeEventListener("ended", done); v.removeEventListener("error", done); v.removeEventListener("canplay", ready); clearTimeout(t); };
  }, [onEnd]);
  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" src={LOGO_MP4} />
      {!videoReady && (
        <motion.div aria-hidden className="absolute inset-0 flex items-center justify-center" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.08, 1], opacity: [0, 1, 1], rotate: [0, -2, 0] }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,.15))" }}>
          <div className="relative">
            <img src={LOGO_PNG} alt="OwarAI logo" className="w-[min(70vw,520px)] h-auto" />
            <motion.div className="pointer-events-none absolute inset-0" initial={{ x: "-120%" }} animate={{ x: ["-120%", "130%"] }} transition={{ duration: 1.2, delay: 0.3, ease: "easeInOut" }} style={{ background: "linear-gradient(105deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.55) 48%, rgba(255,255,255,0) 66%)", mixBlendMode: "soft-light" }} />
          </div>
        </motion.div>
      )}
    </>
  );
}

// ====== メインアプリ ======
export default function App(){
  const [user,setUser]=useState<UserProfile|null>(()=> typeof window!=="undefined" ? storage.get("demo_user", null) : null);
  const [tab,setTab]=useState<"home"|"prompts"|"vote"|"cards"|"leaderboard">("home");

  const [prompts, setPrompts] = useState<Prompt[]>(() => (typeof window!=="undefined" ? storage.get("prompts", seedPrompts) : seedPrompts));
  useEffect(() => { storage.set("prompts", prompts); }, [prompts]);

  const [activePrompt,setActivePrompt]=useState<Prompt|null>(prompts[0] || null);
  const toast = useToast();

  // IMPORTANT: ユーザーはお題追加不可 → 常に false
const [isAdmin, setIsAdmin] = useState(false);
const [adminOpen, setAdminOpen] = useState(false);

useEffect(() => {
  if (typeof window === "undefined") return;
  // URL ?admin=1 または #admin で運営ON
  const params = new URLSearchParams(window.location.search);
  const flag = params.get("admin") === "1" || window.location.hash.includes("admin");
  setIsAdmin(!!flag);

  // Alt + A で “お題追加” モーダルを開く
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.key.toLowerCase() === "a") setAdminOpen(true);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
  // スプラッシュ：プレビュー簡略化のため既定でスキップ
const [splashDone, setSplashDone] = useState(false);


  useEffect(()=>{ if (user) storage.set("demo_user", user); else storage.remove("demo_user") },[user]);
  useEffect(()=>{ seedDemo() },[]);

  const handleCreatePrompt = (d: PromptDraft) => {
  const nextId = (prompts.length ? Math.max(...prompts.map((p) => p.id)) : 0) + 1;
  const newPrompt: Prompt = { id: nextId, ...d };
  setPrompts([...prompts, newPrompt]);
  setActivePrompt(newPrompt);
  setTab("prompts");
  toast.show("お題を追加しました");
};

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#FFD067 0%,#FFC043 40%,#FFAE1A 100%)" }}>
{!splashDone && <SplashIntro onDone={() => setSplashDone(true)} />}


      <Header
        appName={APP_NAME}
        user={user}
        onLogin={setUser}
        onLogout={() => setUser(null)}
        onTabChange={setTab}
        tab={tab}
        isAdmin={isAdmin}
        onShowAdmin={() => setAdminOpen(true)}
      />

      <main className="mx-auto max-w-6xl px-4 pb-24 text-amber-950">
        {tab === "home" && (
          <HomeView
            prompts={prompts}
            onPickPrompt={(p) => { setActivePrompt(p); setTab("prompts"); }}
            go={setTab}
          />
        )}

        {tab === "prompts" && (
          <PromptsView
            prompts={prompts}
            active={activePrompt}
            onSelect={setActivePrompt}
            user={user}
            isAdmin={isAdmin}
            onPosted={(/* s */) => toast.show("投稿しました。投票で評価を集めよう！")}
          />
        )}

        {tab === "vote" && <VoteView user={user} />}
        {tab === "cards" && <MyCardsView user={user} />}
        {tab === "leaderboard" && <LeaderboardView />}
      </main>

      {/* 管理パネルは非表示（運営のみ） */}
      {isAdmin && (
  <AdminPanel
    open={adminOpen}
    onClose={() => setAdminOpen(false)}
    onCreate={handleCreatePrompt}
    defaultWeek={((prompts.length ? prompts[prompts.length - 1] : undefined)?.leagueWeek ?? 0) + 1}
    existing={prompts}
  />
)}

      {toast.ui}
    </div>
  );
}

// ====== ホーム（Canva風） ======
function HomeView({
  prompts,
  onPickPrompt,
  go,
}: {
  prompts: Prompt[];
  onPickPrompt: (p: Prompt) => void;
  go: (t: "home" | "prompts" | "vote" | "cards" | "leaderboard") => void;
}) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLowerCase().trim();

  // タグ集計（人気順）
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    prompts.forEach((p) => (p.tags || []).forEach((t) => {
      const k = norm(t);
      m.set(k, (m.get(k) || 0) + 1);
    }));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [prompts]);

  // 検索（タイトル/本文/タグ）
  const results = useMemo(() => {
    const needle = norm(q);
    if (!needle) return prompts.slice(0, 6);
    return prompts
      .filter((p) => {
        const hay = `${p.title} ${p.body} ${(p.tags || []).join(" ")}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [q, prompts]);

  const openFirst = () => { if (results[0]) onPickPrompt(results[0]); };

  return (
    <div className="space-y-6">
      {/* HERO：大きな検索 */}
      <Card className="relative overflow-hidden p-0">
        <div className="p-8 md:p-10 bg-gradient-to-br from-sky-50 via-indigo-50 to-violet-50">
          <div className="max-w-3xl">
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-amber-950/90">
              さあ、何を返しましょう？
            </div>
            <p className="mt-2 text-sm text-amber-900/70">
              お題やタグを検索して、すぐに「3秒返し」を始めよう。
            </p>

            {/* 検索バー */}
            <div className="mt-5 relative">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==="Enter"){ openFirst(); } }}
                placeholder="キーワード / #タグ を入力"
                className="w-full h-12 pl-11 pr-12 rounded-full text-[15px]
                           bg-white/90 border border-amber-100
                           shadow-[0_1px_2px_rgba(16,24,40,.06)]
                           focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-amber-800/60"/>
              <button
                onClick={openFirst}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full
                           bg-amber-500 text-white grid place-items-center hover:bg-amber-600"
                aria-label="検索"
              >
                <ChevronRight className="w-5 h-5"/>
              </button>
            </div>

            {/* クイックアクション */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={()=>go("prompts")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-amber-100 hover:bg-amber-50">
                <Sparkles className="w-4 h-4"/> お題を探す
              </button>
              <button onClick={()=>go("vote")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-amber-100 hover:bg-amber-50">
                <VoteIcon className="w-4 h-4"/> 投票に参加
              </button>
              <button onClick={()=>go("cards")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-amber-100 hover:bg-amber-50">
                <Share2 className="w-4 h-4"/> 結果カード
              </button>
              <button onClick={()=>go("leaderboard")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white border border-amber-100 hover:bg-amber-50">
                <Trophy className="w-4 h-4"/> リーグ
              </button>
            </div>
          </div>
        </div>

        {/* 検索結果（サジェスト風） */}
        <div className="p-4 md:p-6">
          <div className="text-xs font-semibold text-amber-900/70 mb-2">おすすめ / 検索結果</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((p)=>(
              <button key={p.id} onClick={()=>onPickPrompt(p)} className="text-left">
                <Card className="p-4 hover:shadow-[0_6px_20px_rgba(16,24,40,.08)] transition-shadow">
                  <div className="font-semibold truncate">{p.title}</div>
                  <div className="text-xs text-amber-900/70 mt-1 line-clamp-2">{p.body}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.tags||[]).slice(0,3).map(t=> (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-50 border border-amber-100 text-amber-900">
                        <Tag className="w-3 h-3"/>#{t}
                      </span>
                    ))}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* 人気タグ */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-amber-600"/><div className="font-semibold">人気のタグ</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tagCounts.length===0 && <span className="text-sm text-amber-900/60">タグはまだありません</span>}
          {tagCounts.map(([t])=> (
            <button key={t} onClick={()=>setQ(`#${t}`)}
              className="px-3 py-1 rounded-full text-sm bg-white border border-amber-100 hover:bg-amber-50">
              #{t}
            </button>
          ))}
        </div>
      </Card>

      {/* 新着お題 */}
      <Card className="p-5">
        <div className="font-semibold mb-3">新着お題</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {prompts.slice(-6).reverse().map((p)=>(
            <button key={p.id} onClick={()=>onPickPrompt(p)} className="text-left">
              <Card className="p-4 hover:shadow-[0_6px_20px_rgba(16,24,40,.08)] transition-shadow">
                <div className="font-semibold truncate">{p.title}</div>
                <div className="text-xs text-amber-900/70 mt-1 line-clamp-2">{p.body}</div>
              </Card>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ====== ヘッダー ======
function Header({ appName, user, onLogin, onLogout, onTabChange, tab, isAdmin, onShowAdmin }:{
  appName: string;
  user: UserProfile | null;
  onLogin: (u: UserProfile) => void;
  onLogout: () => void;
  onTabChange: (t: any) => void;
  tab: string;
  isAdmin: boolean;
  onShowAdmin: () => void;
}){
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(user?.handle ?? "");
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-amber-100/60 text-amber-950">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img src={LOGO_PNG} alt="OwarAI" className="w-7 h-7 rounded-full" />
          <span className="font-extrabold tracking-tight">{appName}</span>
          <Badge className="ml-2">β</Badge>
        </div>

        <nav className="ml-6 hidden md:flex items-center gap-2 text-sm">
          <NavButton active={tab === "home"} onClick={() => onTabChange("home")}>ホーム</NavButton>
          <NavButton active={tab === "prompts"} onClick={() => onTabChange("prompts")}>お題</NavButton>
          <NavButton active={tab === "vote"} onClick={() => onTabChange("vote")}>投票</NavButton>
          <NavButton active={tab === "cards"} onClick={() => onTabChange("cards")}>結果カード</NavButton>
          <NavButton active={tab === "leaderboard"} onClick={() => onTabChange("leaderboard")}>リーグ</NavButton>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={onShowAdmin}>
              <PlusCircle className="w-4 h-4" />
              お題追加
            </Button>
          )}
          {user ? (
            <>
              <Badge className="bg-amber-600/90 text-amber-50">@{user.handle}</Badge>
              <Button variant="outline" onClick={onLogout}>
                <LogOut className="w-4 h-4" />
                ログアウト
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpen(true)}>
              <LogIn className="w-4 h-4" />
              ログイン/登録
            </Button>
          )}
        </div>
      </div>

      {/* ログイン用モーダル */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 bg-black/30 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.98, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
            >
              <Card className="p-5">
                <h3 className="text-lg font-bold mb-3">ログイン / 新規登録</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-amber-800/70">ハンドルネーム</label>
                    <Input value={handle} onChange={setHandle} placeholder="例：yamada" />
                  </div>
                  <Button
                    onClick={() => {
                      const id = user?.id ?? `u-${(crypto?.randomUUID?.() || Math.random().toString(36)).slice(0,8)}`;
                      const h  = (handle.trim() || `user${Math.floor(Math.random()*999)}`);
                      onLogin({ id, handle: h });
                      setOpen(false);
                    }}
                  >
                    <Send className="w-4 h-4" />
                    入室する
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavButton({ children, active, onClick }:{ children: React.ReactNode; active?: boolean; onClick?: () => void; }){
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full ${active ? "bg-amber-900 text-amber-50" : "text-amber-900 hover:bg-amber-200"}`}>
      {children}
    </button>
  );
}

// ====== 管理パネル（運営専用。プレビューでは未使用） ======
function AdminPanel({ open, onClose, onCreate, defaultWeek = 1, existing }:{
  open: boolean; onClose: () => void; onCreate: (d: PromptDraft) => void; defaultWeek?: number; existing: Prompt[];
}){
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [family, setFamily] = useState<Family>("air");
  const [week, setWeek] = useState<number>(defaultWeek);
  const [tagsText, setTagsText] = useState("");

  useEffect(() => { if (open) { setTitle(""); setBody(""); setFamily("air"); setWeek(defaultWeek); setTagsText(""); } }, [open, defaultWeek]);
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.98, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}>
          <Card className="p-5">
            <h3 className="text-lg font-bold mb-3">お題を追加</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-amber-800/70">タイトル</label>
                <Input value={title} onChange={setTitle} placeholder="例：ドライブ中に相手が眠いと言ってきた" />
              </div>
              <div>
                <label className="text-xs text-amber-800/70">説明/補足</label>
                <TextArea value={body} onChange={setBody} rows={2} placeholder="例：安全第一＆空気を和ませる切り返し" />
              </div>

              <div>
                <label className="text-xs text-amber-800/70">タグ（#区切り / スペース・カンマ可）</label>
                <Input value={tagsText} onChange={setTagsText} placeholder="例：#デート #ドライブ, 共感" />
                <div className="mt-1 text-xs text-amber-800/70">
                  解析結果：
                  {parseTags(tagsText).length===0
                    ? <span className="text-amber-800/60">（なし）</span>
                    : parseTags(tagsText).map(t => <span key={t} className="ml-1">#{t}</span>)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-amber-800/70">ファミリー</label>
                  <select value={family} onChange={(e) => setFamily(e.target.value as Family)}
                          className="w-full rounded-xl bg-white border border-amber-300 px-3 py-2 text-sm text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                    <option value="air">air（空気・共感）</option>
                    <option value="character">character（キャラ）</option>
                    <option value="before_after">before_after（前後）</option>
                    <option value="creative">creative（クリエイティブ）</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-amber-800/70">週番号（リーグ）</label>
                  <Input value={String(week)} onChange={(v) => setWeek(Number(v) || 1)} placeholder="1" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button onClick={() => {
                  if (!title.trim()) return alert("タイトルを入れてください");
                  const draft: PromptDraft = {
                    title: title.trim(),
                    body: body.trim(),
                    family,
                    leagueWeek: week,
                    tags: parseTags(tagsText)
                  };
                  onCreate(draft);
                  onClose();
                }}>
                  <PlusCircle className="w-4 h-4" /> 追加する
                </Button>
                <Button variant="outline" onClick={onClose}>閉じる</Button>
              </div>

              <div className="pt-3 border-t border-amber-200">
                <div className="text-xs text-amber-800/70 mb-2">既存お題（{existing.length} 件）</div>
                <div className="max-h-40 overflow-auto space-y-1 text-sm">
                  {existing.slice().reverse().map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="truncate">{p.title}</span>
                      <span className="text-amber-800/60 text-xs ml-2 truncate">
                        {(p.tags || []).slice(0,4).map(t => `#${t}`).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ====== お題 → 投稿 ======
function PromptsView({ prompts, active, onSelect, user, isAdmin, onPosted }:{
  prompts: Prompt[]; active: Prompt | null; onSelect: (p: Prompt) => void; user: UserProfile | null; isAdmin: boolean; onPosted: OnPostedFn;
}){
  const [text, setText] = useState("");
  const ruleScore = useMemo(() => (active ? scoreByFamily(text, active.family).score : 0), [text, active?.id]);
  const ng = useMemo(() => hitNG(text), [text]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // === タグ検索 ===
  const [searchText, setSearchText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    prompts.forEach(p => (p.tags || []).forEach(t => set.add(normalizeTag(t))));
    return Array.from(set);
  }, [prompts]);

  const suggestions = useMemo(() => {
    const q = normalizeTag(searchText);
    if (!q) return [];
    return allTags.filter(t => t.includes(q) && !selectedTags.includes(t)).slice(0,8);
  }, [allTags, searchText, selectedTags]);

  const addTag = (t: string) => {
    const n = normalizeTag(t);
    if (n && !selectedTags.includes(n)) setSelectedTags([...selectedTags, n]);
    setSearchText("");
  };
  const removeTag = (t: string) => setSelectedTags(selectedTags.filter(x => x !== t));

  const filteredPrompts = useMemo(() => {
    if (selectedTags.length === 0) return prompts;
    return prompts.filter(p => {
      const tags = (p.tags || []).map(normalizeTag);
      return selectedTags.every(t => tags.includes(t));
    });
  }, [prompts, selectedTags]);

  const handleSelect = (p: Prompt) => {
    onSelect(p);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => setTimeout(() => inputRef.current?.focus(), 150));
    try { history.replaceState(null, "", "#write"); } catch {}
  };

  const hasPosted = !!user && !!active && _submissions.some((s) => s.userId === user.id && s.promptId === active.id);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* 左：タグ検索 + お題一覧 */}
      <div className="lg:col-span-1 space-y-3">
        {/* タグ検索 UI */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">タグで検索</div>

          {/* 選択タグ */}
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedTags.map(t => (
              <button key={t} onClick={() => removeTag(t)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200"
                title="このタグを外す">
                #{t}<span className="opacity-60">×</span>
              </button>
            ))}
            {selectedTags.length===0 && <span className="text-xs text-amber-800/70">例：#デート #ドライブ</span>}
          </div>

          {/* 入力欄 */}
          <input
            value={searchText}
            onChange={(e)=>setSearchText(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); addTag(searchText); } }}
            placeholder="タグ名を入力して Enter"
            className="w-full rounded-xl bg-white border border-amber-300 px-3 py-2 text-sm text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          {/* サジェスト */}
          {suggestions.length>0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button key={s} onClick={()=>addTag(s)}
                  className="px-2 py-0.5 rounded-full text-xs border border-amber-300 text-amber-900 hover:bg-amber-100">
                  #{s}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3">
            <Button variant="ghost" onClick={()=>{ setSelectedTags([]); setSearchText(""); }}>クリア</Button>
          </div>
        </Card>

        {/* フィルタ済みお題一覧 */}
        {filteredPrompts.map((p) => (
          <Card key={p.id}
            className={`p-4 cursor-pointer ${active?.id === p.id ? "ring-2 ring-amber-500" : ""}`}
            onClick={() => handleSelect(p)} role="button" tabIndex={0}>
            <div className="flex items-center gap-2">
              <h3 className="font-bold">{p.title}</h3>
            </div>
            <p className="text-sm text-amber-800/80 mt-1">{p.body}</p>

            {/* タグ表示（クリックでフィルタに追加） */}
            <div className="mt-2 flex flex-wrap gap-2">
              {(p.tags || []).map(t => (
                <button key={t} onClick={(e)=>{ e.stopPropagation(); addTag(t); }}
                  className="px-2 py-0.5 rounded-full text-xs bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100">
                  #{t}
                </button>
              ))}
            </div>

            <div className="text-xs text-amber-800/60 mt-2">W{p.leagueWeek}</div>
          </Card>
        ))}

        {/* コツカード */}
        <Card className="p-4">
          <div className="text-xs text-amber-800/80">ヒント：シーンのコツ</div>
          <ul className="text-sm mt-1 list-disc pl-4 space-y-1">
            <li><b>短く</b>：10〜90文字でテンポ</li>
            <li><b>労わり</b>：安全・共感・気遣いの一言</li>
            <li><b>ひと捻り</b>：比喩/パロディ/意外性を少し</li>
          </ul>
        </Card>
      </div>

      {/* 右：投稿エリア */}
      <div className="lg:col-span-2" ref={formRef}>
        {active && (
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-extrabold">{active.title}</h2>
            </div>
            <p className="text-sm text-amber-800/80 mt-1">{active.body}</p>

            <div className="mt-4">
              <TextArea ref={inputRef} value={text} onChange={setText} rows={3} placeholder="ここに3秒レスを書こう（10〜90文字）" />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={`${ng ? "text-red-500" : "text-amber-800/70"}`}>{ng ? "NGワード検出" : "問題なし"}</span>
                <span className="text-amber-800/70">{normalize(text).length} 文字 / 予測スコア <b className="text-amber-900">{ruleScore}</b></span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button disabled={!isAdmin && hasPosted} onClick={() => {
                if (!user) { alert("先にログインしてください"); return; }
                if (ng) { alert("NGワードが含まれています"); return; }
                if (normalize(text).length < 10) { alert("短すぎます"); return; }
                if (!isAdmin && hasPosted) { alert("このお題には既に投稿済みです（運営は無制限）"); return; }
                const { score, guess } = scoreByFamily(text, active.family);
                const sub = upsertSubmission({ promptId: active.id, userId: user.id, content: text, categoryGuess: guess, ruleScore: score, ngFlag: false });
                onPosted(sub); setText(""); requestAnimationFrame(() => inputRef.current?.focus());
              }}>
                <PlusCircle className="w-4 h-4" />
                投稿する
              </Button>
              <span className="text-xs text-amber-800/70">一般：各お題1回 / 運営：無制限</span>
            </div>

            <div className="mt-8">
              <h4 className="text-sm font-bold mb-2">最近の投稿（AIサンプル含む）</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                {listSubmissionsByPrompt(active.id).slice(-6).reverse().map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="text-sm">{s.content}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-amber-800/70">
                      <span>スコア：{s.ruleScore}</span>
                    </div>
                  </Card>
                ))}
                {listSubmissionsByPrompt(active.id).length === 0 && (
                  <div className="text-sm text-amber-800/60">まだ投稿がありません</div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ====== 投票（スワイプ/タップ/キー対応） ======
function VoteView({ user }: { user: UserProfile | null }){
  const [queue, setQueue] = useState<Submission[]>(() => listOthersForVoting(user?.id || "guest"));
  const [current, setCurrent] = useState<Submission | null>(queue[0] || null);
  const [dragX, setDragX] = useState(0);
  const toast = useToast();

  const THRESHOLD = 120;
  const remaining = queue.length;

  useEffect(() => { const q = listOthersForVoting(user?.id || "guest"); setQueue(q); setCurrent(q[0] || null); }, [user?.id, _submissions.length, _votes.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!current) return; if (!user) { alert("先にログインしてください"); return; } if (e.key === "1" || e.key === "ArrowLeft") commitVote(1); else if (e.key === "2" || e.key === " " || e.key === "Spacebar") commitVote(2); else if (e.key === "3" || e.key === "ArrowRight") commitVote(3); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user?.id, current?.id]);

  const nextCard = (excludeId?: number) => { const rest = excludeId ? queue.filter((s) => s.id !== excludeId) : queue.slice(1); setQueue(rest); setCurrent(rest[0] || null); setDragX(0); };
  const commitVote = (score: 1 | 2 | 3) => { if (!user || !current) return; castVote({ submissionId: current.id, voterId: user.id, score }); toast.show(`投票しました：${score} 点`); nextCard(current.id); };
  const onDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
  const x = info.offset.x;
  if (!current) return;
  if (!user) { alert("先にログインしてください"); setDragX(0); return; }
  if (x > THRESHOLD) commitVote(3);
  else if (x < -THRESHOLD) commitVote(1);
  else commitVote(2);
};

  if (!current) {
    return (
      <>
        <Card className="p-8 text-center">
          <VoteIcon className="w-8 h-8 mx-auto text-amber-800/60" />
          <div className="mt-2 text-sm text-amber-900/80">いま投票できる投稿はありません。<br/>新しい投稿を待つか、自分でも投稿してみよう。</div>
        </Card>
        {toast.ui}
      </>
    );
  }

  const hintLeftOpacity = Math.min(Math.abs(Math.min(dragX, 0)) / THRESHOLD, 1);
  const hintRightOpacity = Math.min(Math.max(dragX, 0) / THRESHOLD, 1);

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between text-sm text-amber-900/80">
          <span>残り {remaining} 件</span>
          <button className="underline underline-offset-2 hover:opacity-80" onClick={() => nextCard()}>スキップ</button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <Card className="p-6 relative overflow-hidden">
              {/* スワイプ方向ヒント */}
              <div className="absolute inset-y-0 left-0 w-24 pointer-events-none flex items-center justify-center" style={{ opacity: hintLeftOpacity }}>
                <div className="rotate-[-12deg] rounded-xl border border-amber-300 bg-white px-3 py-1 text-sm text-amber-800 shadow">😐 1</div>
              </div>
              <div className="absolute inset-y-0 right-0 w-24 pointer-events-none flex items-center justify-center" style={{ opacity: hintRightOpacity }}>
                <div className="rotate-[12deg] rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 shadow">🔥 3</div>
              </div>

{/* ドラッグ対象（本文） */}
<motion.div
  drag="x"
  onDrag={(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setDragX(info.offset.x);
  }}
  onDragEnd={onDragEnd}
  dragSnapToOrigin
  className="cursor-grab active:cursor-grabbing"
>
  <div className="flex items-center gap-2 text-xs text-amber-900/70">
    <span>予測スコア：{current.ruleScore}</span>
  </div>
  <div className="mt-4 text-lg leading-relaxed select-none">
    {current.content}
  </div>
</motion.div>

{/* タップでも採点 */}
<div className="mt-6 grid grid-cols-3 gap-2">
  <Button variant="outline" onClick={() => commitVote(1)}>{"😐 1"}</Button>
  <Button variant="outline" onClick={() => commitVote(2)}>{"🙂 2"}</Button>
  <Button onClick={() => commitVote(3)}>
    <Flame className="w-4 h-4" />
    3
  </Button>
</div>

              <p className="mt-3 text-xs text-amber-900/70">ヒント：左へスワイプ=1 / タップ=2 / 右へスワイプ=3 ・ キー= 1/2/3・←/→・Space</p>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
      {toast.ui}
    </>
  );
}

// ====== 結果カード ======
function MyCardsView({ user }: { user: UserProfile | null }) {
  const toast = useToast();

  if (!user) {
    return (
      <Card className="p-6 text-sm text-amber-900/80">
        結果カードを見るにはログインしてください。
      </Card>
    );
  }

  const subs = _submissions.filter((s) => s.userId === user.id);
  if (subs.length === 0) {
    return (
      <Card className="p-6 text-sm text-amber-900/80">
        まだ投稿がありません。お題から投稿してみよう。
      </Card>
    );
  }

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {subs.map((s) => {
          const { totalVotes, avgScore } = aggregateFor(s.id);
          const shareUrl = makeShareUrl(s.id);

          return (
            <Card key={s.id} className="p-4 flex flex-col">
              <div className="text-xs text-amber-900/70">
                <span>
                  人評価：{avgScore}（{totalVotes}票）
                </span>
              </div>

              <div className="mt-3 text-base">{s.content}</div>

              <div className="mt-auto pt-4 flex items-center justify-between">
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(
                    "#OwarAI｜私の結果カード"
                  )}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline">
                    <Share2 className="w-4 h-4" />
                    Xで共有
                  </Button>
                </a>

                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast.show("リンクをコピーしました");
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = shareUrl;
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand("copy");
                      document.body.removeChild(ta);
                      toast.show("リンクをコピーしました");
                    }
                  }}
                >
                  <Copy className="w-4 h-4" />
                  コピー
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {toast.ui}
    </>
  );
}

// ====== リーグ ======
function LeaderboardView(){
  const rows = useMemo(()=>{
    const map=new Map<string,{userId:string; totalVotes:number; sum:number}>();
    _submissions.forEach(s=>{ const {totalVotes,avgScore}=aggregateFor(s.id); const prev=map.get(s.userId)||{userId:s.userId,totalVotes:0,sum:0}; map.set(s.userId,{userId:s.userId,totalVotes:prev.totalVotes+totalVotes,sum:prev.sum+avgScore*totalVotes}) });
    const list=Array.from(map.values()).map(r=>({userId:r.userId,votes:r.totalVotes,avg:r.totalVotes?+(r.sum/r.totalVotes).toFixed(2):0}));
    return list.sort((a,b)=>(b.votes-a.votes)||(b.avg-a.avg)).slice(0,20)
  },[_submissions.length, _votes.length]);
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-600"/><h3 className="font-bold">週次リーグ（デモ）</h3></div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-amber-900/70"><th className="text-left py-2">順位</th><th className="text-left py-2">ユーザー</th><th className="text-right py-2">獲得票</th><th className="text-right py-2">平均スコア</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(<tr key={r.userId} className="border-t"><td className="py-2">{i+1}</td><td className="py-2">{r.userId}</td><td className="py-2 text-right">{r.votes}</td><td className="py-2 text-right">{r.avg}</td></tr>))}
            {rows.length===0 && (<tr><td colSpan={4} className="py-6 text-center text-amber-900/60">まだランキングはありません</td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
