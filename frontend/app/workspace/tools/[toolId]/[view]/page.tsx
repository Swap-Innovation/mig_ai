import Client from "./Client";
import { toolViewStaticParams } from "@/lib/staticParams";

export function generateStaticParams() {
  return toolViewStaticParams();
}

export default function Page() {
  return <Client />;
}
