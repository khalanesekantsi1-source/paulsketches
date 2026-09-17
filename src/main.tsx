import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, type User } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, runTransaction, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./styles.css";

type Profile = { uid: string; displayName: string; email: string; photoURL: string; bio: string; createdAt?: Timestamp };
type Post = { id: string; uid: string; displayName: string; photoURL: string; text: string; imageURL?: string; likes: string[]; likesCount: number; createdAt?: Timestamp };
const initials = (name: string) => name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "M";
const ago = (value?: Timestamp) => value ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.round((Date.now() - value.toMillis()) / 60000), "minute") : "Just now";

function Avatar({ src, name, size = "h-10 w-10" }: { src?: string; name: string; size?: string }) {
  return src ? <img src={src} alt={name} className={`${size} rounded-full object-cover`} /> : <div className={`${size} grid place-items-center rounded-full bg-blue-100 font-bold text-facebook`}>{initials(name)}</div>;
}

function Auth() {
  const [register, setRegister] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (e: FormEvent) => { e.preventDefault(); setError(""); try { if (register) { const result = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(result.user, { displayName: name }); await setDoc(doc(db, "users", result.user.uid), { uid: result.user.uid, displayName: name, email, photoURL: "", bio: "", createdAt: serverTimestamp() }); } else await signInWithEmailAndPassword(auth, email, password); } catch (err) { setError(err instanceof Error ? err.message : "Unable to authenticate"); } };
  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"><h1 className="mb-2 text-3xl font-bold text-facebook">MiniFeed</h1><p className="mb-7 text-slate-500">Share moments with your friends.</p>{register && <input className="field" required placeholder="Display name" value={name} onChange={e => setName(e.target.value)} />}<input className="field" required type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><input className="field" required minLength={6} type="password" placeholder="Password (6+ characters)" value={password} onChange={e => setPassword(e.target.value)} />{error && <p className="mb-3 text-sm text-red-600">{error}</p>}<button className="primary w-full">{register ? "Create account" : "Log in"}</button><button type="button" className="mt-4 w-full text-sm text-facebook" onClick={() => setRegister(!register)}>{register ? "Already have an account? Log in" : "Create a new account"}</button></form></main>;
}

function Navbar({ user }: { user: User }) {
  return <header className="sticky top-0 z-10 border-b bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4"><Link to="/" className="text-2xl font-extrabold text-facebook">MiniFeed</Link><input className="hidden max-w-sm flex-1 rounded-full bg-slate-100 px-5 py-2 outline-none focus:ring-2 focus:ring-blue-200 md:block" placeholder="Search MiniFeed" /> <div className="ml-auto flex items-center gap-3"><Link to={`/profile/${user.uid}`}><Avatar src={user.photoURL || undefined} name={user.displayName || user.email || "User"} /></Link><button onClick={() => signOut(auth)} className="text-sm font-semibold text-slate-500 hover:text-facebook">Log out</button></div></div></header>;
}

function CreatePost({ profile }: { profile: Profile }) {
  const [text, setText] = useState(""); const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (!text.trim() && !file) return; setBusy(true); try { let imageURL = ""; if (file) { const imageRef = ref(storage, `posts/${profile.uid}/${Date.now()}-${file.name}`); await uploadBytes(imageRef, file); imageURL = await getDownloadURL(imageRef); } const postRef = doc(collection(db, "posts")); await setDoc(postRef, { id: postRef.id, uid: profile.uid, displayName: profile.displayName, photoURL: profile.photoURL || "", text: text.trim(), imageURL, likes: [], likesCount: 0, createdAt: serverTimestamp() }); setText(""); setFile(undefined); (e.currentTarget as HTMLFormElement).reset(); } finally { setBusy(false); } };
  return <form onSubmit={submit} className="card mb-5"><div className="flex gap-3"><Avatar src={profile.photoURL} name={profile.displayName} /><input className="flex-1 rounded-full bg-slate-100 px-4 outline-none" placeholder={`What's on your mind, ${profile.displayName}?`} value={text} onChange={e => setText(e.target.value)} /></div><div className="mt-4 flex items-center justify-between border-t pt-3"><label className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-facebook">📷 Photo<input className="hidden" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0])} /></label><span className="mr-auto ml-3 text-xs text-slate-400">{file?.name}</span><button disabled={busy} className="primary px-5 py-2">{busy ? "Posting…" : "Post"}</button></div></form>;
}

function PostCard({ post, uid }: { post: Post; uid: string }) {
  const liked = post.likes?.includes(uid);
  const toggle = async () => { const postRef = doc(db, "posts", post.id); await runTransaction(db, async tx => { const snap = await tx.get(postRef); if (!snap.exists()) return; const data = snap.data() as Post; const isLiked = (data.likes || []).includes(uid); tx.update(postRef, { likes: isLiked ? arrayRemove(uid) : arrayUnion(uid), likesCount: increment(isLiked ? -1 : 1) }); }); };
  return <article className="card"><div className="flex items-center gap-3"><Avatar src={post.photoURL} name={post.displayName} /><div><Link className="font-bold hover:text-facebook" to={`/profile/${post.uid}`}>{post.displayName}</Link><p className="text-xs text-slate-400">{ago(post.createdAt)}</p></div></div>{post.text && <p className="mt-4 whitespace-pre-wrap text-slate-700">{post.text}</p>}{post.imageURL && <img src={post.imageURL} alt="Post attachment" className="mt-4 max-h-[520px] w-full rounded-lg object-cover" />}<div className="mt-4 flex items-center border-t pt-3"><button onClick={toggle} className={`font-semibold ${liked ? "text-facebook" : "text-slate-500 hover:text-facebook"}`}>{liked ? "♥" : "♡"} Like</button><span className="ml-4 text-sm text-slate-500">{post.likesCount || 0} {post.likesCount === 1 ? "like" : "likes"}</span></div></article>;
}

function Sidebars({ profile, right = false }: { profile: Profile; right?: boolean }) {
  if (right) return <aside className="hidden lg:block"><div className="card"><h2 className="mb-4 font-bold">Contacts</h2>{["Amelia", "Thabo", "Mpho"].map(name => <div className="mb-3 flex items-center gap-2 text-sm" key={name}><span className="h-2 w-2 rounded-full bg-green-500" /><span>{name}</span></div>)}</div></aside>;
  return <aside className="hidden space-y-4 lg:block"><div className="card"><Link to={`/profile/${profile.uid}`} className="flex items-center gap-3 font-bold"><Avatar src={profile.photoURL} name={profile.displayName} /><span>{profile.displayName}</span></Link><div className="mt-5 space-y-3 text-sm text-slate-600"><Link className="block hover:text-facebook" to={`/profile/${profile.uid}`}>👤 Profile</Link><span className="block">👥 Friends</span></div></div></aside>;
}

function Feed({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile>(); const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => { const unsub = onSnapshot(doc(db, "users", user.uid), snap => setProfile(snap.data() as Profile)); return unsub; }, [user.uid]);
  useEffect(() => onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), snap => setPosts(snap.docs.map(d => d.data() as Post))), []);
  if (!profile) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  return <><Navbar user={user} /><main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,640px)_220px]"><Sidebars profile={profile} /><section><div className="mb-5"><h1 className="text-2xl font-bold text-slate-900">Good day, {profile.displayName}.</h1><p className="mt-1 text-sm text-slate-500">See what your community is sharing.</p></div><CreatePost profile={profile} /><div className="space-y-5">{posts.map(post => <PostCard key={post.id} post={post} uid={user.uid} />)}</div></section><Sidebars profile={profile} right /></main></>;
}

function ProfilePage({ user }: { user: User }) {
  const { uid } = useParams(); const [profile, setProfile] = useState<Profile>(); const [bio, setBio] = useState(""); const [editing, setEditing] = useState(false);
  useEffect(() => uid ? onSnapshot(doc(db, "users", uid), s => { const p = s.data() as Profile; setProfile(p); setBio(p?.bio || ""); }) : undefined, [uid]);
  if (!profile) return <><Navbar user={user} /><div className="p-8 text-center">Profile not found.</div></>;
  const saveBio = async () => { await setDoc(doc(db, "users", profile.uid), { bio }, { merge: true }); setEditing(false); };
  return <><Navbar user={user} /><main className="mx-auto max-w-2xl px-4 py-8"><div className="card text-center"><Avatar src={profile.photoURL} name={profile.displayName} size="mx-auto h-28 w-28" /><h1 className="mt-4 text-2xl font-bold">{profile.displayName}</h1><p className="mt-2 text-slate-600">{profile.bio || "No bio yet."}</p>{profile.uid === user.uid && <>{editing ? <div className="mt-5"><textarea className="field min-h-24" value={bio} onChange={e => setBio(e.target.value)} /><button className="primary mr-2" onClick={saveBio}>Save</button><button onClick={() => setEditing(false)}>Cancel</button></div> : <button className="mt-5 text-sm font-semibold text-facebook" onClick={() => setEditing(true)}>Edit bio</button>}</>}</div></main></>;
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  if (!user) return <Auth />;
  return <Routes><Route path="/profile/:uid" element={<ProfilePage user={user} />} /><Route path="*" element={<Feed user={user} />} /></Routes>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
