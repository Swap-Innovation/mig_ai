import Client from "./Client";
import { phaseStaticParams } from "@/lib/staticParams";

export function generateStaticParams() {
  return phaseStaticParams();
}

export default function Page() {
  return <Client />;
}
