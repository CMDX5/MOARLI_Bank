---
Task ID: 1
Agent: Main Agent
Task: Verify all features and fix UI issues in MOARLI Bank

Work Log:
- Analyzed full codebase: 8200+ line MoraliApp.tsx, 20+ extracted components, 60+ API routes
- Fixed "Voir tout" button: confirmed connected to notification bell panel
- Fixed profile icons: replaced generic gray icons with professional color-coded icons per item type (shield=blue, user=blue, lock=gold, receipt=green, headset=purple, document=amber, eye-off=gray)
- Added CSS for `.tab-card-icon` with proper 44px sizing and border radius
- Added `eye-off` icon to IconName type and AppIcon component (was missing, causing fallback circle)
- Replaced unprofessional emoji icons (🪪📘🚗) in KYC document type selector with proper AppIcon SVGs (document, globe, building)
- Upgraded KYC status section to use AppIcon "shield" instead of raw inline SVGs, with larger 42px icon container
- Wired ThemeProvider in layout.tsx wrapping all children
- Imported and rendered 7 orphaned components: GoalSavingsView, BudgetView, ChatSupportView, LeaderboardView, OnboardingView, PayLinksView, BusinessDashboardView
- Added navigation functions for all new screens (openGoalSavings, openBudget, openChatSupport, openLeaderboard, openPayLinks, openBusiness)
- Replaced old inline support chat modal with ChatSupportView component
- Added onboarding check after login (localStorage flag "morali-onboarding-done")
- Wired ThemeToggle in privacy settings modal

Stage Summary:
- TypeScript: 0 errors
- ESLint: 0 errors, 0 warnings
- Dev server: HTTP 200, compiling successfully
- All 14 features verified and properly connected
- 7 previously orphaned components now fully integrated
- 3 theme system (Base, MOARLI Dark, MOARLI Light) working via ThemeProvider + ThemeToggle
- Professional icon styling across profile and KYC sections
