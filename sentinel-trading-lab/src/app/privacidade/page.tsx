import Link from 'next/link';
export const metadata={title:'Privacidade | Sentinel Trading Lab'};
export default function Privacidade(){return <main style={{maxWidth:800,margin:'0 auto',padding:'40px 22px',lineHeight:1.7}}>
 <Link href="/">← Sentinel Trading Lab</Link>
 <h1>Política de privacidade</h1>
 <p>Para oferecer o Sentinel, tratamos dados necessários à autenticação, gestão de pagamento e funcionamento da licença, como e-mail da conta, identificadores técnicos da instalação, datas de validade, presença da sessão e status de conexão do Agent. Esses dados são utilizados para fornecer o serviço, prevenir uso não autorizado e prestar suporte.</p>
 <p>A plataforma usa infraestrutura de hospedagem, autenticação e pagamento, incluindo Vercel, Supabase e Kiwify, nos limites necessários para operar o produto. O Agent acessa dados de mercado e conta exibidos na corretora autorizada pelo usuário; o serviço não solicita o envio da senha da corretora para o site.</p>
 <p>Credenciais de login do Sentinel são pessoais. O navegador mantém um cookie de sessão protegido; fechar a última aba interrompe a renovação de presença e o Agent perde a autorização de análise quando a tolerância termina. A revogação ou a expiração do acesso pode exigir a conservação de registros indispensáveis para fins legais.</p>
 <p>Você pode solicitar informações, correção ou exclusão de dados pessoais quando cabível pela LGPD pelos canais de suporte indicados na plataforma e no comprovante de compra. Algumas informações devem ser mantidas pelo período exigido em lei.</p>
 <p><Link href="/termos">Termos de uso</Link></p>
 </main>}
