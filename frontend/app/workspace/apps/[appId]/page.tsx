import Client from "./Client";
import { appStaticParams } from "@/lib/staticParams";

export function generateStaticParams() {
  return appStaticParams();
}

export default function Page() {
  return <Client />;
}
