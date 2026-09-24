import {redirect} from "next/navigation";

export default function StoreLoginBridge(){
  redirect("https://www.vetorizeai.com.br/login?next=%2Fminha-loja%2Fpainel");
}
