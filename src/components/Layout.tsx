import { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-[100px] lg:pt-[116px]">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
