import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const Overview = lazy(() => import("./pages/dash/Overview"));
const Positions = lazy(() => import("./pages/dash/Positions"));
const Watchlist = lazy(() => import("./pages/dash/Watchlist"));
const Profile = lazy(() => import("./pages/dash/Profile"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <span className="microlabel animate-pulse">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<RouteFallback />}>
              <DashboardLayout />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={null}>
                <Overview />
              </Suspense>
            }
          />
          <Route
            path="positions"
            element={
              <Suspense fallback={null}>
                <Positions />
              </Suspense>
            }
          />
          <Route
            path="watchlist"
            element={
              <Suspense fallback={null}>
                <Watchlist />
              </Suspense>
            }
          />
          <Route
            path="profile"
            element={
              <Suspense fallback={null}>
                <Profile />
              </Suspense>
            }
          />
        </Route>
        {/* /login is gone in the demo build — send old links to the desk */}
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
