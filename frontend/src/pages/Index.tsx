import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/");
  }, [navigate]);

  return null;
}
