import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, type User } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, runTransaction, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, isFirebaseConfigured, storage } from "./firebase";
import "./styles.css";

type Profile = { uid: string; displayName: string; email: string; photoURL: string; bio: string; role?: "artist" | "viewer"; createdAt?: Timestamp };
type Post = { id: string; uid: string; displayName: string; photoURL: string; text: string; imageURL?: string; likes?: string[]; likesCount: number; comments?: number; createdAt?: Timestamp; category?: string };
type Story = { name: string; image: string; avatar: string; own?: boolean };
type Comment = { id: number; name: string; text: string; avatar: string };
type SessionUser = Pick<User, "uid" | "displayName" | "email" | "photoURL">;

const demoPosts: Post[] = [
  { id: "demo-1", uid: "maya", displayName: "Maya Mokoena", photoURL: "https://i.pravatar.cc/120?img=47", text: "A slow morning in the studio. I’m learning to leave a little more room for the unexpected. What are you making this week?", imageURL: "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1200&q=85", likesCount: 126, comments: 18, category: "Studio life" },
  { id: "demo-2", uid: "thabo", displayName: "Thabo Ndlovu", photoURL: "https://i.pravatar.cc/120?img=12", text: "Golden hour at the market ✨", imageURL: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85", likesCount: 84, comments: 9, category: "Photography" },
];
const stories: Story[] = [
  { name: "Your story", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=500&q=80", avatar: "You", own: true },
  { name: "Maya", image: "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=500&q=80", avatar: "https://i.pravatar.cc/80?img=47" },
  { name: "Thabo", image: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=500&q=80", avatar: "https://i.pravatar.cc/80?img=12" },
  { name: "Amelia", image: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=500&q=80", avatar: "https://i.pravatar.cc/80?img=32" },
  { name: "Lebo", image: "https://images.unsplash.com/photo-1577083552431-6e5fd01988a5?auto=format&fit=crop&w=500&q=80", avatar: "https://i.pravatar.cc/80?img=5" },
];
const contacts = [
  ["Mpho Radebe", "https://i.pravatar.cc/80?img=14"], ["Amelia Nkosi", "https://i.pravatar.cc/80?img=32"],
  ["Lebo Maseko", "https://i.pravatar.cc/80?img=5"], ["Kabelo Motsoeneng", "https://i.pravatar.cc/80?img=68"],
];
const initials = (name: string) => name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "ME";
const ago = (value?: Timestamp) => value ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.max(1, Math.round((Date.now() - value.toMillis()) / 60000)), "minute") : "Just now";

function Avatar({ src, name, size = "avatar-md" }: { src?: string; name: string; size?: string }) {
  return src ? <img src={src} alt="" className={`avatar ${size}`} /> : <div className={`avatar avatar-fallback ${size}`}>{initials(name)}</div>;
}
function Icon({ children }: { children: ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function Auth() {
  const [register, setRegister] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (e: FormEvent) => { e.preventDefault(); setError(""); try { if (register) { const result = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(result.user, { displayName: name }); await setDoc(doc(db, "users", result.user.uid), { uid: result.user.uid, displayName: name, email, photoURL: "", bio: "", role: "viewer", createdAt: serverTimestamp() }); } else await signInWithEmailAndPassword(auth, email, password); } catch (err) { setError(err instanceof Error ? err.message : "Unable to authenticate"); } };
  return <main className="auth-page"><div className="auth-brand"><div className="brand-mark">P</div><p className="auth-kicker">PAUL SKETCHES · LESOTHO</p><h1>Where Lesotho’s creative spirit comes together.</h1><p>Discover local talent, share your work, and build meaningful connections with artists, collectors, and art lovers.</p></div><form onSubmit={submit} className="auth-card"><h2>{register ? "Join the collective" : "Welcome back"}</h2><p className="muted">{register ? "Create your place in Lesotho’s creative community." : "Sign in to see what’s happening across the arts community."}</p>{register && <input className="field" required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />}<input className="field" required type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} /><input className="field" required minLength={6} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />{error && <p className="error">{error}</p>}<button className="primary wide">{register ? "Create account" : "Log in"}</button><div className="divider"><span>or</span></div><button type="button" className="text-button" onClick={() => setRegister(!register)}>{register ? "Already have an account? Log in" : "Create new account"}</button></form></main>;
}

function Navbar({ user }: { user: SessionUser }) {
  const [search, setSearch] = useState("");
  return <header className="topbar"><div className="topbar-inner"><Link to="/" className="brand"><span className="brand-mark">P</span><span className="brand-word">Paul Sketches</span></Link><label className="search"><Icon>⌕</Icon><input aria-label="Search" placeholder="Search artists and artwork" value={search} onChange={e => setSearch(e.target.value)} /></label><nav className="top-nav" aria-label="Primary navigation"><Link className="nav-link active" to="/" aria-label="Home"><Icon>⌂</Icon><span>Home</span></Link><Link className="nav-link" to="/popular" aria-label="Discover artists"><Icon>▣</Icon><span>Discover</span></Link></nav><div className="top-actions"><button className="circle-button" aria-label="Create post">＋</button><button className="circle-button" aria-label="Messages">♧</button><button className="circle-button" aria-label="Notifications">♡</button><Link to={`/profile/${user.uid}`} className="profile-chip"><Avatar src={user.photoURL || undefined} name={user.displayName || "You"} size="avatar-sm" /><span>{user.displayName?.split(" ")[0] || "You"}</span></Link><button className="logout" onClick={() => signOut(auth)}>Log out</button></div></div></header>;
}

function LeftSidebar({ profile }: { profile: Profile }) {
  return <aside className="left-sidebar"><Link className="sidebar-profile" to={`/profile/${profile.uid}`}><Avatar src={profile.photoURL} name={profile.displayName} /><strong>{profile.displayName}</strong></Link><nav className="side-nav"><Link className="side-item active" to="/"><Icon>⌂</Icon> Home</Link><Link className="side-item" to="/popular"><Icon>♧</Icon> Artists</Link><Link className="side-item" to="/popular"><Icon>▣</Icon> Groups</Link><Link className="side-item" to="/popular"><Icon>▤</Icon> Art market</Link><Link className="side-item" to={`/profile/${profile.uid}`}><Icon>◉</Icon> Events</Link></nav><div className="sidebar-divider" /><p className="sidebar-label">Your shortcuts</p><div className="shortcut"><span className="shortcut-icon purple">✦</span><span>Creative community</span></div><div className="shortcut"><span className="shortcut-icon orange">◒</span><span>Lesotho art markets</span></div><div className="shortcut"><span className="shortcut-icon green">♧</span><span>Design thinkers</span></div></aside>;
}

function Stories({ user }: { user: SessionUser }) {
  return <section className="stories card"><div className="section-heading"><h2>Stories</h2><button className="link-button">See all</button></div><div className="story-row">{stories.map((story, index) => <button className="story" key={story.name}><div className="story-image"><img src={story.image} alt="" />{story.own ? <span className="story-add">＋</span> : <span className="story-avatar"><Avatar src={story.avatar} name={story.name} size="avatar-sm" /></span>}</div><span>{index === 0 ? "Add to story" : story.name}</span></button>)}</div></section>;
}

function Composer({ profile, onLocalPost }: { profile: Profile; onLocalPost: (post: Post) => void }) {
  const [text, setText] = useState(""); const [open, setOpen] = useState(false); const [file, setFile] = useState<File>();
  const submit = (e: FormEvent) => { e.preventDefault(); if (!text.trim() && !file) return; onLocalPost({ id: `local-${Date.now()}`, uid: profile.uid, displayName: profile.displayName, photoURL: profile.photoURL, text: text.trim() || "Shared a photo", likesCount: 0, comments: 0, imageURL: file ? URL.createObjectURL(file) : undefined }); setText(""); setFile(undefined); setOpen(false); };
  return <form className="card composer" onSubmit={submit}><div className="composer-top"><Avatar src={profile.photoURL} name={profile.displayName} /><button type="button" className="composer-input" onClick={() => setOpen(true)}>What’s on your mind, {profile.displayName.split(" ")[0]}?</button></div>{open && <textarea autoFocus className="composer-textarea" placeholder="Share something with your community..." value={text} onChange={e => setText(e.target.value)} />}{open && <div className="composer-submit"><span className="muted small">Everyone can see this post</span><button className="primary" type="submit">Post</button></div>}<div className="composer-options"><label className="composer-option"><Icon>▣</Icon> Photo/video<input type="file" accept="image/*" onChange={e => { setFile(e.target.files?.[0]); setOpen(true); }} /></label><button type="button" className="composer-option" onClick={() => setOpen(true)}><Icon>☺</Icon> Feeling/activity</button><button type="button" className="composer-option" onClick={() => setOpen(true)}><Icon>•••</Icon> More</button></div></form>;
}

function PostCard({ post, uid }: { post: Post; uid: string }) {
  const [liked, setLiked] = useState(post.likes?.includes(uid) || false); const [likes, setLikes] = useState(post.likesCount || 0); const [comments, setComments] = useState<Comment[]>([]); const [comment, setComment] = useState(""); const [showComments, setShowComments] = useState(false); const [shared, setShared] = useState(false);
  const toggle = async () => { setLiked(!liked); setLikes(value => value + (liked ? -1 : 1)); if (!post.id.startsWith("demo-") && !post.id.startsWith("local-")) { const postRef = doc(db, "posts", post.id); await runTransaction(db, async tx => { const snap = await tx.get(postRef); if (!snap.exists()) return; const data = snap.data() as Post; const isLiked = (data.likes || []).includes(uid); tx.update(postRef, { likes: isLiked ? arrayRemove(uid) : arrayUnion(uid), likesCount: increment(isLiked ? -1 : 1) }); }); } };
  const addComment = (e: FormEvent) => { e.preventDefault(); if (!comment.trim()) return; setComments(value => [...value, { id: Date.now(), name: "You", text: comment.trim(), avatar: "" }]); setComment(""); setShowComments(true); };
  return <article className="card post"><div className="post-header"><Avatar src={post.photoURL} name={post.displayName} /><div className="post-author"><Link to={`/profile/${post.uid}`}><strong>{post.displayName}</strong></Link><span>{ago(post.createdAt)} · <Icon>◉</Icon></span></div><button className="more-button" aria-label="More options">•••</button></div>{post.text && <p className="post-copy">{post.text}</p>}{post.imageURL && <img className="post-image" src={post.imageURL} alt={post.category || "Shared post"} />}{(likes > 0 || comments.length > 0) && <div className="post-stats"><span><b className="reaction-dot">♥</b> {likes}</span><button onClick={() => setShowComments(!showComments)}>{comments.length || post.comments || 0} comments</button></div>}<div className="post-actions"><button className={liked ? "liked" : ""} onClick={toggle}><Icon>{liked ? "♥" : "♡"}</Icon> Like</button><button onClick={() => setShowComments(!showComments)}><Icon>◯</Icon> Comment</button><button className={shared ? "liked" : ""} onClick={() => setShared(true)}><Icon>↗</Icon> {shared ? "Shared" : "Share"}</button></div>{showComments && <div className="comments"><div className="comment-list">{comments.map(item => <div className="comment" key={item.id}><Avatar src={item.avatar || undefined} name={item.name} size="avatar-sm" /><div><strong>{item.name}</strong><p>{item.text}</p></div></div>)}</div><form className="comment-form" onSubmit={addComment}><Avatar name="You" size="avatar-sm" /><input aria-label="Write a comment" placeholder="Write a comment..." value={comment} onChange={e => setComment(e.target.value)} /></form></div>}</article>;
}

function RightSidebar() {
  return <aside className="right-sidebar"><div className="section-heading"><h2>Contacts</h2><button className="more-button" aria-label="Contact options">•••</button></div><div className="contacts">{contacts.map(([name, photo]) => <div className="contact" key={name}><div className="contact-avatar"><Avatar src={photo} name={name} /><span className="online" /></div><span>{name}</span></div>)}</div><div className="sidebar-divider" /><div className="section-heading"><h2>Trending for you</h2></div><div className="trending"><div><span className="muted small">TRENDING IN LESOTHO</span><strong>#CreativeMaseru</strong><span className="muted small">2.4K posts</span></div><div><span className="muted small">ART & DESIGN</span><strong>Local artists to watch</strong><span className="muted small">1.1K posts</span></div><div><span className="muted small">COMMUNITY</span><strong>Weekend markets</strong><span className="muted small">856 posts</span></div></div></aside>;
}

function Feed({ user }: { user: SessionUser }) {
  const [profile, setProfile] = useState<Profile>(); const [posts, setPosts] = useState<Post[]>(demoPosts); const [loading, setLoading] = useState(true);
  useEffect(() => { const unsub = onSnapshot(doc(db, "users", user.uid), snap => { const data = snap.data() as Profile | undefined; setProfile(data || { uid: user.uid, displayName: user.displayName || "You", email: user.email || "", photoURL: user.photoURL || "", bio: "" }); setLoading(false); }, () => { setProfile({ uid: user.uid, displayName: user.displayName || "You", email: user.email || "", photoURL: user.photoURL || "", bio: "" }); setLoading(false); }); return unsub; }, [user]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), snap => { if (snap.docs.length) setPosts(snap.docs.map(d => d.data() as Post)); }, () => undefined);
  }, []);
  const addLocalPost = (post: Post) => setPosts(value => [post, ...value]);
  if (loading || !profile) return <div className="loading">Loading your feed…</div>;
  return <><Navbar user={user} /><div className="app-layout"><LeftSidebar profile={profile} /><main className="feed"><div className="feed-heading"><div><p className="eyebrow">PAUL SKETCHES · LESOTHO</p><h1>Good morning, {profile.displayName.split(" ")[0]} <span>👋</span></h1><p className="muted">Find inspiration and celebrate the talent around you.</p></div><button className="filter-button">Recent <span>⌄</span></button></div><Stories user={user} /><Composer profile={profile} onLocalPost={addLocalPost} />{posts.map(post => <PostCard key={post.id} post={post} uid={user.uid} />)}</main><RightSidebar /></div></>;
}

function PopularArtists({ user }: { user: SessionUser }) {
  const rankings = useMemo(() => demoPosts.map((post, index) => ({ ...post, rank: index + 1 })), []);
  return <><Navbar user={user} /><main className="discovery"><p className="eyebrow">DISCOVER</p><h1>Popular artists</h1><p className="muted">Meet the people making waves in your community.</p><div className="artist-grid">{rankings.map(artist => <article className="card artist-card" key={artist.id}><img src={artist.imageURL} alt="" /><div className="artist-info"><Avatar src={artist.photoURL} name={artist.displayName} size="avatar-lg" /><span className="rank">#{artist.rank}</span><h2>{artist.displayName}</h2><p className="muted">{artist.category} · {artist.likesCount} likes</p><Link className="outline-button" to={`/profile/${artist.uid}`}>View profile</Link></div></article>)}</div></main></>;
}

function ProfilePage({ user }: { user: SessionUser }) { const { uid } = useParams(); return <><Navbar user={user} /><main className="profile-page"><div className="profile-cover" /><div className="card profile-card"><Avatar name={uid === user.uid ? user.displayName || "You" : "Member"} size="avatar-xl" /><h1>{uid === user.uid ? user.displayName : "Community member"}</h1><p className="muted">Sharing ideas, moments, and creative work with the community.</p><button className="primary">Edit profile</button></div></main></>; }
function App() {
  const demoUser: SessionUser = { uid: "demo-user", displayName: "Alex Morgan", email: "demo@example.com", photoURL: "" };
  const [user, setUser] = useState<SessionUser | null | undefined>(isFirebaseConfigured ? undefined : demoUser);
  useEffect(() => isFirebaseConfigured ? onAuthStateChanged(auth, setUser) : undefined, []);
  if (user === undefined) return <div className="loading">Loading…</div>;
  if (!user) return <Auth />;
  return <><div className="demo-banner">Paul Sketches demo · Connect Firebase variables to enable accounts and live community data.</div><Routes><Route path="/profile/:uid" element={<ProfilePage user={user} />} /><Route path="/popular" element={<PopularArtists user={user} />} /><Route path="*" element={<Feed user={user} />} /></Routes></>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
