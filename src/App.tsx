import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { toast } from 'react-hot-toast'
import { Copy, Users, DollarSign, Mail } from 'lucide-react'
import { supabase } from './lib/supabaseClient'

interface Profile {
  id: string
  email: string
  interac_email: string | null
  referral_code: string
  earnings: number
  created_at: string
}

interface Referral {
  id: number
  referrer_id: string
  referred_id: string
  created_at: string
}

function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  
  // Auth form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(true)
  
  // Referral state
  const [referralCode, setReferralCode] = useState('')
  
  // Payout state
  const [payoutEmail, setPayoutEmail] = useState('')
  const [isPayoutRequesting, setIsPayoutRequesting] = useState(false)

  useEffect(() => {
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search)
    const ref = urlParams.get('ref')
    if (ref) {
      setReferralCode(ref)
    }

    // Get session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setReferrals([])
      }
    })

    setLoading(false)
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    try {
      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError
      setProfile(profileData)
      setPayoutEmail(profileData.interac_email || '')

      // Load referrals
      const { data: referralData, error: referralError } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId)

      if (referralError) throw referralError
      setReferrals(referralData || [])
    } catch (error: any) {
      console.error('Error loading profile:', error)
      toast.error('Failed to load profile data')
    }
  }

  async function handleAuth() {
    try {
      setLoading(true)
      
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        })

        if (error) throw error

        // If there's a referral code, process it
        if (referralCode && data.user) {
          await processReferral(data.user.email!)
        }

        toast.success('Sign up successful! You received a $10 CAD bonus!')
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
        toast.success('Welcome back!')
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function processReferral(referredEmail: string) {
    if (!referralCode) return

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          referredEmail,
          referrerCode: referralCode,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        console.error('Referral processing failed:', result)
      }
    } catch (error) {
      console.error('Error processing referral:', error)
    }
  }

  async function handleUpdateInteracEmail() {
    if (!profile || !payoutEmail) {
      toast.error('Please enter your Interac email')
      return
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ interac_email: payoutEmail })
        .eq('id', profile.id)

      if (error) throw error
      
      setProfile({ ...profile, interac_email: payoutEmail })
      toast.success('Interac email updated successfully!')
    } catch (error: any) {
      toast.error('Failed to update Interac email')
    }
  }

  async function handlePayoutRequest() {
    if (!profile) return

    if (!profile.interac_email) {
      toast.error('Please set your Interac email first')
      return
    }

    if (profile.earnings < 10) {
      toast.error('Minimum $10 CAD required for payout')
      return
    }

    try {
      setIsPayoutRequesting(true)
      
      const { data, error } = await supabase
        .from('payouts')
        .insert({
          user_id: profile.id,
          amount: profile.earnings,
          interac_email: profile.interac_email,
        })
        .select()
        .single()

      if (error) throw error

      // Reset earnings to 0
      await supabase
        .from('profiles')
        .update({ earnings: 0 })
        .eq('id', profile.id)

      setProfile({ ...profile, earnings: 0 })
      
      toast.success(`Payout request of $${data.amount} CAD submitted! You'll receive an Interac e-Transfer shortly.`)
    } catch (error: any) {
      toast.error('Failed to request payout')
    } finally {
      setIsPayoutRequesting(false)
    }
  }

  function copyReferralLink() {
    if (!profile) return
    const link = `${window.location.origin}?ref=${profile.referral_code}`
    navigator.clipboard.writeText(link)
    toast.success('Referral link copied to clipboard!')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setReferrals([])
    toast.success('Signed out successfully')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 p-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Interac Referral System</h1>
            <p className="text-indigo-200">Earn real money with Interac e-Transfer</p>
          </div>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardHeader>
              <CardTitle className="text-white">{isSignUp ? 'Create Account' : 'Sign In'}</CardTitle>
              <CardDescription className="text-indigo-100">
                {isSignUp ? 'Sign up and get $10 CAD instantly!' : 'Welcome back to your earnings dashboard'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {referralCode && isSignUp && (
                <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-lg p-3">
                  <p className="text-sm text-indigo-100">You were referred! You'll both earn bonuses.</p>
                </div>
              )}
              
              <div>
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              
              <div>
                <Label htmlFor="password" className="text-white">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <Button 
                onClick={handleAuth} 
                disabled={loading}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                {isSignUp ? 'Sign Up & Get $10 Bonus' : 'Sign In'}
              </Button>

              <div className="text-center">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-indigo-200 hover:text-white text-sm"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Interac Referral Dashboard</h1>
            <p className="text-indigo-200">Earn real money via Interac e-Transfer</p>
          </div>
          <Button onClick={handleSignOut} variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Earnings Card */}
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5" /> Your Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-indigo-400 mb-4">
                ${profile?.earnings.toFixed(2)} CAD
              </div>
              <p className="text-indigo-100 text-sm">
                Minimum payout: $10 CAD
              </p>
            </CardContent>
          </Card>

          {/* Referrals Card */}
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5" /> Your Referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-indigo-400 mb-4">
                {referrals.length}
              </div>
              <p className="text-indigo-100 text-sm">
                Earn $10 CAD per referral
              </p>
            </CardContent>
          </Card>

          {/* Referral Link Card */}
          <Card className="bg-white/10 backdrop-blur border-white/20 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-white">Your Referral Link</CardTitle>
              <CardDescription className="text-indigo-100">
                Share this link to earn $10 CAD for each person who signs up
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}?ref=${profile?.referral_code}`}
                  className="bg-white/10 border-white/20 text-white"
                />
                <Button onClick={copyReferralLink} className="bg-indigo-500 hover:bg-indigo-600">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interac Payout Card */}
          <Card className="bg-white/10 backdrop-blur border-white/20 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Mail className="w-5 h-5" /> Interac e-Transfer Payout
              </CardTitle>
              <CardDescription className="text-indigo-100">
                Receive your earnings directly to your bank via Interac e-Transfer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="interac-email" className="text-white">
                  Your Interac e-Transfer Email
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="interac-email"
                    type="email"
                    placeholder="your-email@bank.ca"
                    value={payoutEmail}
                    onChange={(e) => setPayoutEmail(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                  <Button 
                    onClick={handleUpdateInteracEmail}
                    disabled={!payoutEmail || payoutEmail === profile?.interac_email}
                    className="bg-indigo-500 hover:bg-indigo-600"
                  >
                    Update
                  </Button>
                </div>
                <p className="text-xs text-indigo-200 mt-1">
                  This should be the email registered with your bank for Interac e-Transfer
                </p>
              </div>

              <Button
                onClick={handlePayoutRequest}
                disabled={isPayoutRequesting || !profile?.interac_email || (profile?.earnings || 0) < 10}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
                size="lg"
              >
                {isPayoutRequesting ? 'Processing...' : `Request Payout (${profile?.earnings.toFixed(2) || '0.00'} CAD)`}
              </Button>

              {profile?.interac_email && (
                <p className="text-sm text-indigo-200 text-center">
                  Payouts will be sent to: <span className="font-medium">{profile.interac_email}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default App