import { useState, useEffect } from "react"
import { SignedIn, SignedOut, SignIn, useUser } from "@clerk/clerk-react"
import Sidebar from "@/components/layout/Sidebar"
import Chat from "@/components/chat/Chat"
import AdminDashboard from "@/components/layout/AdminDashboard"

function App() {
  const { user } = useUser()
  const [activeRole, setActiveRole] = useState("employee")
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark")

  // Sync state to admin if user metadata specifies they are an admin
  useEffect(() => {
    if (user?.publicMetadata?.role === "admin" || user?.primaryEmailAddress?.emailAddress === "shreyastalwar334@gmail.com") {
      setActiveRole("admin")
    } else {
      setActiveRole("employee")
    }
  }, [user])

  // Apply theme to document HTML tag
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
    localStorage.setItem("theme", theme)
  }, [theme])



  return (
    <>
      <SignedOut>
        <div className="h-screen w-screen flex flex-col md:flex-row bg-linear-to-br from-indigo-950 via-slate-900 to-black text-white overflow-hidden">
          {/* Left panel - branding */}
          <div className="flex-1 flex flex-col justify-center px-12 md:px-24 py-12 relative overflow-hidden bg-cover bg-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/50 via-indigo-950/20 to-black">
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:30px_30px]" />
            <div className="relative z-10 max-w-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-6">
                🏢 Enterprise HR Suite
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                AI HR Knowledge <br />
                <span className="bg-clip-text text-transparent bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400">
                  Assistant
                </span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed mb-8">
                Instantly search and retrieve company policies, guidelines, and handbooks using intelligent Retrieval-Augmented Generation.
              </p>
              <div className="grid grid-cols-2 gap-6 border-t border-slate-800 pt-8">
                <div>
                  <div className="text-xl font-bold text-indigo-400">RAG Powered</div>
                  <div className="text-xs text-slate-500 mt-1">Semantic vector database searches</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-purple-400">Secure Roles</div>
                  <div className="text-xs text-slate-500 mt-1">Clerk and Flask verified access</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel - sign in form */}
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-900/40 backdrop-blur-md border-t md:border-t-0 md:border-l border-slate-800/80">
            <div className="w-full max-w-md bg-slate-900/60 p-8 rounded-2xl border border-slate-800 shadow-2xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold">Welcome back</h2>
                <p className="text-slate-400 text-sm mt-1">Sign in to your corporate account</p>
              </div>
              <div className="flex justify-center">
                <SignIn 
                  routing="hash" 
                  appearance={{
                    variables: {
                      colorPrimary: '#4f46e5',
                      colorBackground: '#0f172a',
                      colorText: '#ffffff',
                      colorInputBackground: '#1e293b',
                      colorInputText: '#ffffff',
                      colorTextOnPrimaryBackground: '#ffffff',
                      colorTextSecondary: '#94a3b8',
                    },
                    elements: {
                      card: 'bg-slate-900 border border-slate-800 shadow-none p-0',
                      headerTitle: 'hidden',
                      headerSubtitle: 'hidden',
                      footer: 'hidden',
                      badge: 'hidden', // hides the badge natively
                      socialButtonsBlockButton: 'bg-slate-800/80 border border-slate-700 text-white hover:bg-slate-700/80',
                      socialButtonsBlockButtonText: 'text-white',
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </SignedOut>


      <SignedIn>
        <div className="h-screen flex">
          <Sidebar activeRole={activeRole} setActiveRole={setActiveRole} theme={theme} setTheme={setTheme} />
          <main className="flex-1 min-w-0">
            {activeRole === "admin" ? <AdminDashboard /> : <Chat />}
          </main>
        </div>
      </SignedIn>

    </>
  )
}

export default App