import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "@/api/axiosClient";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
} | null;

type AuthContextValue = {
  user: User;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("ims_token");
  });
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const storedToken =
      typeof window !== "undefined"
        ? localStorage.getItem("ims_token")
        : null;

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    setToken(storedToken);

    const fetchMe = async () => {
      try {
        const response = await axiosClient.get("/auth/me");
        if (response.data?.success) {
          const me = response.data.data?.user ?? response.data.data;
          setUser(me);
        }
      } catch (error: any) {
        if (error?.response?.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("ims_token");
          }
          setUser(null);
          setToken(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const response = await axiosClient.post("/auth/login", {
          email,
          password,
        });

        if (!response.data?.success) {
          throw new Error(
            response.data?.message || "Login failed",
          );
        }

        const { token: accessToken, user: loggedInUser } = response.data.data;

        if (typeof window !== "undefined") {
          localStorage.setItem("ims_token", accessToken);
        }

        setToken(accessToken);
        setUser(loggedInUser);
      } catch (error) {
        throw error;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await axiosClient.post("/auth/logout");
    } catch {
      // ignore logout errors
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("ims_token");
      }
      setUser(null);
      setToken(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

