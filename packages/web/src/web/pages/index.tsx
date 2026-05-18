import { useEffect } from "react";

function Index() {
  useEffect(() => {
    window.location.replace("/admin/login");
  }, []);

  return null;
}

export default Index;
