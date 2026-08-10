import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { BrowsePage } from "@/pages/BrowsePage";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { CreateListingPage } from "@/pages/CreateListingPage";
import { EditListingPage } from "@/pages/EditListingPage";
import { HomePage } from "@/pages/HomePage";
import { ListingDetailPage } from "@/pages/ListingDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { MyListingsPage } from "@/pages/MyListingsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { AdminListingsPage } from "@/pages/admin/AdminListingsPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";

/**
 * FE-002: every backend endpoint gets a corresponding, working UI route
 * (Milestone 5 exit criterion). `/login`, `/register`, and `/listings*`
 * (browse + detail) are reachable while unauthenticated (FR-001/FR-005);
 * everything else requires a session, and `/admin/*` additionally requires
 * the `admin` role — both enforced client-side by `ProtectedRoute` as a UX
 * nicety only, with the server as the real boundary (SEC-030/031).
 */
function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/listings" element={<BrowsePage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />

        {/* Deliberately not wrapped in `ProtectedRoute`: that guard itself
            redirects "password-change-required" sessions to this exact
            route, which would loop. `AuthContext`'s global handler already
            navigates here on the triggering 403 from any other route. */}
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route
          path="/listings/new"
          element={
            <ProtectedRoute>
              <CreateListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/listings/:id/edit"
          element={
            <ProtectedRoute>
              <EditListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-listings"
          element={
            <ProtectedRoute>
              <MyListingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requireAdmin>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/listings"
          element={
            <ProtectedRoute requireAdmin>
              <AdminListingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
