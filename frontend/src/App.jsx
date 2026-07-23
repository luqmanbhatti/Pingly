import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/useAuth";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyPin from "./pages/VerifyPin";
import SetupProfile from "./pages/SetupProfile";
import ChatList from "./pages/ChatList";
import ChatLayout from "./pages/ChatLayout";
import ChatWindow from "./pages/ChatWindow";
import ProfilePage from "./pages/ProfilePage";
import EditProfile from "./pages/EditProfile";
import CallScreen from "./pages/CallScreen";
import IncomingCallBanner from "./components/IncomingCallBanner";
import LoadingScreen from "./components/LoadingScreen";

function Gate({ children }) {
  const { firebaseUser, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!profile?.emailVerified) return <Navigate to="/verify" replace />;
  if (!profile?.username) return <Navigate to="/setup" replace />;
  return (
    <>
      <IncomingCallBanner />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify" element={<VerifyPin />} />
      <Route path="/setup" element={<SetupProfile />} />
      <Route
        element={
          <Gate>
            <ChatLayout />
          </Gate>
        }
      >
        <Route path="/" element={<ChatList />} />
        <Route path="/chat/:chatId" element={<ChatWindow />} />
        <Route path="/profile/:uid" element={<ProfilePage />} />
        <Route path="/edit-profile" element={<EditProfile />} />
      </Route>
      <Route
        path="/call/:callId"
        element={
          <Gate>
            <CallScreen />
          </Gate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
