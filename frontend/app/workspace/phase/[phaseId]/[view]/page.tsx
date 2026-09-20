import Client from "./Client";
import { phaseViewStaticParams } from "@/lib/staticParams";

export function generateStaticParams() {
  return phaseViewStaticParams();
}

export default function Page() {
  return <Client />;
}
