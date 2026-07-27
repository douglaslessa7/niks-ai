/**
 * CATÁLOGO DE DICAS DO DIA — NIKS
 * v2 — cada dica verificada contra a literatura (PubMed + busca web). Ver campo `fonte`.
 *
 * Fila numerada: a usuária vê `ordem: 1` no 1º dia em que abre o app, `ordem: 2` no 2º dia
 * em que abre, e assim por diante. Ao chegar no fim, volta para a primeira (módulo).
 *
 * ⚠️ REGRAS DE COPY (não violar):
 * - Nunca usar a palavra "diagnóstico". Nunca prometer cura ou resultado clínico.
 * - Posicionamento 100% wellness, nunca médico.
 * - `fonte` NÃO é exibida no app. Existe só para auditoria interna.
 */

export type Dica = {
  ordem: number;
  eyebrow: string;   // etiqueta curta no topo do card
  titulo: string;    // o gancho — é o que aparece com o card COLAPSADO
  corpo: string;     // o "porquê" — aparece com o card EXPANDIDO
  fonte: string;     // ⚠️ uso interno, nunca renderizar

  // Campos exclusivos das dicas do tipo RECEITA (eyebrow === 'SHOT NIKS' | 'RECEITA').
  // Quando presentes, o card renderiza a lista de ingredientes + o preparo ANTES do corpo.
  ingredientes?: string[];
  preparo?: string[];
};

export const CATALOGO_DICAS: Dica[] = [
  {
    ordem: 1,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de arroz',
    ingredientes: [
      '3 colheres de sopa de arroz cru',
      '1 xícara de água morna',
      '1 colher de chá de mel',
      '1 colher de sopa de iogurte natural (opcional, para pele seca)',
    ],
    preparo: [
      'Lave o arroz e descarte essa primeira água.',
      'Deixe o arroz de molho na água morna por 30 minutos.',
      'Coe. O líquido leitoso que sobrou é a água de arroz.',
      'Misture algumas colheres dessa água com o mel (e o iogurte, se for usar) até virar uma pasta.',
      'Espalhe no rosto limpo e deixe agir por 15 minutos.',
      'Enxágue com água morna. Use uma ou duas vezes por semana.',
    ],
    corpo:
      'As mulheres Yao, na China, e as mulheres da corte japonesa usam água de arroz há séculos, e a ciência acabou dando razão a elas. Quando o arroz fica de molho, ele solta na água um antioxidante chamado ácido ferúlico. O nome não diz nada, mas ele é exatamente o mesmo ingrediente que dá nome aos séruns mais caros da farmácia: descobriram que ele dobra a força de proteção da vitamina C. Na sua panela a quantidade é bem menor que num sérum, claro. Mas é o mesmo ingrediente, e ele custa três colheres de arroz. Junto vêm outras substâncias que ajudam a pele a segurar água, a acalmar a irritação, e o amido, que forma uma película macia por cima de tudo. O mel entra porque puxa água para dentro da pele e ainda combate bactéria. Um aviso importante: a internet manda deixar a água de arroz fermentando por dias. Não faça isso. Água parada cria bactéria, e você vai passar isso no rosto. Faça na hora e use na hora.',
    fonte:
      'ATIVOS DA ÁGUA DE ARROZ (Oryza sativa): ácido ferúlico (antioxidante), inositol (retenção hídrica, elasticidade, estímulo de fibroblastos — Cosmetics/MDPI 2018), alantoína (calmante, regeneração celular), niacina/B3 (mesma via da niacinamida, inibe transferência de melanina), amido (película calmante). GANCHO PRINCIPAL: Lin et al. 2005 (Duke) — o ácido ferúlico DOBRA a eficácia fotoprotetora da combinação de vitaminas C e E; é a base do sérum "C E Ferulic". ⚠️ A concentração caseira é MUITO menor que a de um sérum formulado — a copy diz isso, e não promete equivalência. AMIDO: banho com amido de arroz (15 min, 2x/dia) melhorou a capacidade de cicatrização da pele em ~20% em dermatite atópica. ⚠️ SEGURANÇA — NÃO FERMENTAR EM CASA: dermatologistas alertam que água de arroz fermentada caseira, sem conservante, é risco sério de contaminação microbiana. A receita usa água FRESCA, preparada e usada na hora. MEL: umectante + atividade antibacteriana. TRADIÇÃO: mulheres Yao (Longsheng, China) e mulheres da corte Heian (Japão). ⚠️ Evidência de eficácia é MODESTA (efeito calmante/hidratante/brilho leve) — a copy NÃO promete clareamento potente nem substituição de qualquer passo da rotina.',
  },
  {
    ordem: 2,
    eyebrow: 'DICA DO DIA',
    titulo: 'Deixe o doce para uma vez na semana',
    corpo:
      'De todas as ligações entre comida e pele, essa é a mais bem provada que existe. Num estudo de 12 semanas, quem cortou o açúcar terminou com o dobro de espinhas a menos do que quem continuou comendo normal. E os cientistas foram além: olharam a pele dessas pessoas no microscópio e viram que as glândulas de óleo tinham encolhido de verdade. O caminho é esse: açúcar no sangue dispara um hormônio, e esse hormônio dá uma ordem para a sua pele: produza mais óleo. Menos açúcar, menos óleo, menos poro entupido. E tem o efeito de longo prazo: o açúcar que sobra no sangue vai grudando nas fibras de colágeno e deixando elas duras e quebradiças. Colágeno duro é pele que perde a firmeza.',
    fonte:
      'Smith et al., Am J Clin Nutr 2007 (RCT 12 sem: −23,5 lesões no grupo baixa carga glicêmica vs −12,0 no controle, p=0,03); Kwon et al., Acta Derm Venereol 2012 (RCT coreano, 10 sem: biópsia mostrou redução do tamanho das glândulas sebáceas, da inflamação e da expressão de SREBP-1 e IL-8); J Acad Nutr Diet 2018 (dieta de baixo IG reduz IGF-1). ✅ Evidência forte.',
  },
  {
    ordem: 3,
    eyebrow: 'DICA DO DIA',
    titulo: 'Shot Retinol',
    ingredientes: [
      '3 cenouras médias',
      '1 laranja (sem casca)',
      '1 pedaço de gengibre (2 cm)',
      '1 colher de chá de cúrcuma',
      '1 pitada de pimenta-do-reino',
      '1 fio de azeite de oliva',
    ],
    preparo: [
      'Bata tudo no liquidificador com meio copo de água.',
      'Coe e guarde na geladeira. Rende cerca de 3 doses, que duram até 3 dias.',
      'Beba junto de uma refeição. Nunca em jejum.',
    ],
    corpo:
      'Começo pela verdade que o TikTok não conta: não tem retinol nenhum nessa receita. A cenoura tem beta-caroteno, aquele pigmento laranja, e o seu corpo transforma ele em vitamina A. Não é a mesma coisa que o retinol do sérum e não substitui ele. Mas o que ele faz é até mais bonito: esse pigmento vai se acumulando na sua pele e muda o tom dela, deixando um dourado quente. E isso foi testado: as pessoas acham esse tom mais saudável e mais bonito do que a pele bronzeada. Esse é o glow, e dá para medir. Agora, o que ninguém acerta: esse pigmento só é absorvido junto com gordura. Sem o fio de azeite, quase tudo passa direto e vai embora. E tomar em jejum, como mandam por aí, é a pior hora possível. A pimenta-do-reino também não está aí de enfeite: ela faz o seu corpo aproveitar muito mais a cúrcuma. Uma dose por dia, no máximo. Cenoura demais deixa a pele e a palma da mão alaranjadas.',
    fonte:
      '⚠️ O NOME é marketing (trend "drink your skincare" / "retinol shot"): NÃO há retinol na receita — há beta-caroteno (pró-vitamina A). A copy diz isso explicitamente para não configurar alegação falsa nem risco regulatório. EFEITO REAL: Stephen et al., PLOS One 2015 (RCT de 6 semanas: smoothie rico em carotenoides alterou mensuravelmente a cor da pele facial); Whitehead/Stephen (coloração carotenoide percebida como mais saudável e atraente que o bronzeado). ABSORÇÃO: beta-caroteno é lipossolúvel — requer gordura; daí o azeite e o "nunca em jejum" (correção direta do que as receitas virais ensinam). PIPERINA: aumenta a biodisponibilidade da curcumina. ⚠️ CAROTENEMIA: excesso de beta-caroteno causa amarelamento/alaranjamento da pele — daí o limite de 1 dose/dia. ⚠️ Fruta limitada a 1 laranja DE PROPÓSITO, para não estourar a carga glicêmica (ver dica 2).',
  },
  {
    ordem: 4,
    eyebrow: 'DICA DO DIA',
    titulo: 'Durma e acorde no mesmo horário, garantindo 7h30 de sono',
    corpo:
      'Isso aqui não é conselho de mãe, é experimento. Pesquisadores fotografaram as mesmas pessoas descansadas e depois mal dormidas, e mostraram as fotos para gente que não sabia de nada. O resultado foi cruel: nas fotos mal dormidas, apontaram olheiras mais escuras, pálpebras caídas, olhos inchados, pele mais pálida e mais linhas no rosto. E disseram que essas pessoas eram menos bonitas. Dormir e acordar sempre na mesma hora faz o sono ficar mais fundo, e é dormindo fundo que a pele se reconstrói. O seu skincare trabalha enquanto você dorme. Dê tempo a ele.',
    fonte:
      'Sundelin et al., Sleep 2013 ("Cues of Fatigue": pálpebras caídas, olhos vermelhos e inchados, olheiras, pele pálida, mais rugas/linhas finas, cantos da boca caídos — todos p<0,01); Sundelin et al., R Soc Open Sci 2017 (percebidos como menos atraentes, menos saudáveis; avaliadores menos inclinados a socializar); Oyetakin-White et al., Clin Exp Dermatol 2015 (má qualidade de sono × envelhecimento cutâneo e recuperação de barreira mais lenta). ✅ Evidência forte. ✅ Confirma a hipótese original do Douglas.',
  },
  {
    ordem: 5,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de aveia para o dia em que a pele está irritada',
    ingredientes: [
      '3 colheres de sopa de aveia em flocos',
      '2 colheres de sopa de água morna',
      '1 colher de chá de mel',
      '1 colher de sopa de iogurte natural (opcional)',
    ],
    preparo: [
      'Bata a aveia no liquidificador até virar um pó bem fino. Isso importa: é o pó fino que funciona, não o floco.',
      'Misture o pó com a água morna e o mel até formar uma pasta.',
      'Espalhe no rosto e deixe agir por 15 minutos.',
      'Enxágue com água morna, sem esfregar. Pode usar sempre que a pele estiver reclamando.',
    ],
    corpo:
      'Essa é a máscara mais bem comprovada de todas, e também a mais barata. A aveia moída bem fininha tem até selo oficial: é o único ingrediente natural que os órgãos reguladores autorizam a dizer que alivia eczema. São mais de trinta estudos com ela. Quem faz o trabalho são umas substâncias da aveia que basicamente desligam a irritação da pele e seguram a coceira e a vermelhidão. Ela também aumenta o cimento que mantém as células da sua pele grudadas umas nas outras (é isso que a gente chama de barreira), e o amido ainda forma uma película macia por cima. Essa é a máscara do dia em que você exagerou no ácido, pegou sol demais, ou a pele simplesmente amanheceu vermelha e reclamando. Ela não promete brilho. Ela promete paz.',
    fonte:
      '✅ A MAIS FORTE DO CATÁLOGO EM EVIDÊNCIA. Aveia coloidal é reconhecida pela FDA (EUA) e pela Health Canada como protetor de pele (skin protectant) — o ÚNICO ingrediente natural autorizado a alegar proteção e alívio dos sintomas de eczema. Base: >30 estudos clínicos, >3.000 pacientes. MECANISMO: avenantramidas (polifenóis) inibem a atividade do NF-κB e a liberação de citocinas pró-inflamatórias e de histamina (Reynertson et al., J Drugs Dermatol 2015; Cerio et al. 2010; Sur et al.). Aumentam a expressão de ceramidas e melhoram a função de barreira (Ilnytska et al. 2016). Proteínas da aveia tamponam o pH cutâneo. Estudo: aplicação tópica de avenantramidas aliviou eritema induzido por UV, inclusive coceira. Emoliente com 1% de aveia coloidal reduziu o risco de crise de dermatite atópica em 44%. ⚠️ CRÍTICO NA RECEITA: precisa ser MOÍDA em pó fino ("coloidal") — floco inteiro não tem o mesmo efeito e ainda esfolia mecanicamente. MEL: umectante + atividade antibacteriana.',
  },
  {
    ordem: 6,
    eyebrow: 'DICA DO DIA',
    titulo: 'Coma um peixe hoje: salmão, sardinha ou atum',
    corpo:
      'O ômega-3 do peixe é o que o seu corpo usa para apagar incêndio. E uma espinha vermelha, inchada e dolorida é exatamente isso: um incêndio pequeno. Num estudo de 10 semanas, quem tomou ômega-3 terminou com quase metade das espinhas inflamadas. A dose que eles usaram é mais ou menos o que tem num filé de salmão. E sardinha em lata vale igual, por cinco reais.',
    fonte:
      'Jung et al., Acta Derm Venereol 2014 (RCT duplo-cego, n=45, 2.000 mg EPA+DHA por 10 semanas: lesões inflamatórias 10,1 → 5,8; H&E mostrou queda de inflamação e de IL-8). ✅ Evidência boa (amostra pequena).',
  },
  {
    ordem: 7,
    eyebrow: 'DICA DO DIA',
    titulo: 'Passe vaselina nos lábios, nas sobrancelhas ou ao redor dos olhos',
    corpo:
      'É o truque mais barato que existe e um dos que mais funcionam. A vaselina não hidrata: ela sela. E sela como nada mais: ela segura 98% da água que ia evaporar da sua pele, enquanto os óleos comuns seguram uns 20%. Mas o mais interessante veio das biópsias: descobriram que a vaselina não fica só parada em cima. Ela faz a sua pele produzir as próprias proteínas com que ela se reconstrói. É como se, além de fechar a porta, ela avisasse a pele para consertar a fechadura. Por isso funciona tão bem nas áreas de pele fininha, que ressecam e descascam primeiro. Passe por cima do seu hidratante, como último passo da noite. Nunca embaixo, ou você sela o nada.',
    fonte:
      'Petrolato reduz TEWL em >98% (vs. 20–30% de outros óleos oleosos) — Loden, Am J Clin Dermatol 2003; Czarnowicki et al., J Allergy Clin Immunol 2016 (biópsias, 2 coortes, n=49: oclusão com petrolato aumentou peptídeos antimicrobianos e proteínas de diferenciação terminal — filagrina e loricrina — mostrando que NÃO é um oclusivo inerte). ⚠️ Manter a indicação restrita a lábios/olhos/sobrancelhas: em pele acneica, fora dessas áreas, o uso é controverso.',
  },
  {
    ordem: 8,
    eyebrow: 'DICA DO DIA',
    titulo: 'Iogurte, chia e frutas vermelhas para a pele',
    corpo:
      'Uma tigela, três ingredientes, dois minutos, e cada um deles tem uma função. O iogurte natural entra com as bactérias boas, porque o seu intestino e a sua pele conversam mais do que você imagina. A chia entra com a fibra, que segura o açúcar da fruta para ele não virar oleosidade depois. E as frutas vermelhas entram com a vitamina C, sem a qual o seu corpo simplesmente não fabrica colágeno. Só tem uma regra, e essa não é negociável: iogurte natural, sem açúcar. O de potinho de fruta tem tanto açúcar que desmancha tudo o que a receita veio fazer. Se quiser adoçar, adoce com a própria fruta.',
    fonte:
      'RECEITA (não é alegação terapêutica sobre iogurte). Componentes: (a) fibra solúvel da chia × pico glicêmico pós-prandial — ver dica 1; (b) vitamina C das frutas vermelhas como cofator da síntese de colágeno — Pullar et al., Nutrients 2017; morango ~59 mg vit. C/100 g; (c) eixo intestino-pele / probióticos — Tjiu & Lu, Medicina (Kaunas) 2025 (meta-análise de 3 RCTs, n=231: efeito modesto, certeza BAIXA a MODERADA — por isso a copy MENCIONA o eixo intestino-pele sem prometer resultado); (d) "sem açúcar" é obrigatório para não contradizer a dica 2 (carga glicêmica). ✅ CONFLITO COM A DICA 10 RESOLVIDO: a dica 10 fala de LEITE LÍQUIDO e esta é uma receita, não uma alegação de que iogurte trata acne.',
  },
  {
    ordem: 9,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de argila para o dia em que a pele estiver muito oleosa',
    ingredientes: [
      '2 colheres de sopa de argila verde (oleosa) ou branca/caulim (sensível)',
      'Água filtrada ou chá verde frio, o suficiente para virar pasta',
      '1 colher de chá de mel',
    ],
    preparo: [
      'Misture a argila com o líquido aos poucos, até virar uma pasta cremosa. Use uma tigela de vidro ou plástico, nunca de metal.',
      'Espalhe uma camada fina no rosto.',
      'Enxágue assim que ela começar a secar. Não deixe rachar.',
      'Use uma vez por semana.',
    ],
    corpo:
      'A argila faz uma coisa só, mas faz muito bem feito: ela chupa. As partículas dela puxam para si o excesso de óleo e a sujeira da superfície da pele. Por isso o rosto sai da máscara sequinho e com os poros parecendo menores. O poro não encolheu, mas ele estava esticado de tanto óleo, e o óleo saiu. Argila verde para pele oleosa, branca para pele mais sensível. E agora o erro que todo mundo comete e que estraga tudo: deixar a máscara secar e rachar no rosto. Quando a argila seca de vez, ela para de puxar óleo e começa a puxar a água da sua pele. Você sai da máscara mais ressecada do que entrou. Enxágue enquanto ela ainda está úmida ao toque. E se você usar chá verde no lugar da água, leva os antioxidantes dele junto.',
    fonte:
      'ARGILA (bentonita/verde/caulim): partículas com capacidade de troca iônica e alta área superficial → adsorção de sebo e de impurezas da superfície cutânea. Efeito matificante e redução da APARÊNCIA dos poros (o poro não muda de tamanho — a copy diz isso explicitamente para não vender mentira). ⚠️ Evidência cosmética MODESTA — a alegação foi mantida branda e mecanicista de propósito. ⚠️ NÃO DEIXAR SECAR/RACHAR: uma vez saturada, a argila passa a extrair água do estrato córneo, aumentando o ressecamento e a TEWL. Este é o erro mais comum e está corrigido na copy. ⚠️ Tigela não metálica: o metal pode interferir na atividade iônica da argila. SINERGIA: substituir a água por chá verde frio agrega EGCG (ver dica 22).',
  },
  {
    ordem: 10,
    eyebrow: 'DICA DO DIA',
    titulo: 'Diminua o consumo de leite',
    corpo:
      'O leite de vaca carrega hormônios da própria vaca e ainda faz o seu corpo disparar insulina. E essa combinação acaba dando a mesma ordem de sempre para a sua pele: produza mais óleo. Estudos com dezenas de milhares de pessoas encontraram essa ligação. Mas a parte realmente útil é a dose: quem toma um copo ou mais por dia tem mais espinha; quem toma de dois a seis copos por semana não mostrou diferença nenhuma. Ou seja: você não precisa cortar. Precisa diminuir. E tem a surpresa que derruba todo mundo: o leite desnatado aparece pior que o integral, não melhor. Tirar a gordura não resolve, porque o problema nunca foi a gordura.',
    fonte:
      'Aghasi et al., Clin Nutr 2019 (meta-análise: leite total OR 1,48; leite desnatado OR 1,82 — mais forte que o integral); Juhl et al., Nutrients 2018 (meta-análise, n=78.529: qualquer leite OR 1,28; ≥1 copo/dia OR 1,41–1,43, MAS 2–6 copos/semana NÃO significativo). Melnik 2011 (mecanismo insulinotrópico/IGF-1). ⚠️ REESCRITO: o rascunho dizia "cortar leite E DERIVADOS" — a evidência aponta para o LEITE LÍQUIDO, e a dose-resposta permite uma dica mais acionável ("reduza") em vez de proibitiva ("corte").',
  },
  {
    ordem: 11,
    eyebrow: 'DICA DO DIA',
    titulo: 'Shot de Hortelã',
    ingredientes: [
      '2 xícaras de chá de hortelã bem forte (Mentha spicata), já frio',
      'Suco de 1 limão',
      '1/2 pepino',
      '1 pedaço pequeno de gengibre',
      'Folhas de hortelã fresca',
      'Gelo',
    ],
    preparo: [
      'Faça um chá de hortelã bem forte e deixe esfriar.',
      'Bata o chá gelado com o limão, o pepino e o gengibre.',
      'Sirva com bastante gelo. Duas xícaras é a dose, e isso não é sugestão, é o que os estudos usaram.',
    ],
    corpo:
      'Esse é o único shot que mexe com hormônio, e é exatamente por isso que ele funciona. Mulheres que tomaram chá de hortelã duas vezes por dia durante um mês tiveram uma queda de cerca de 24% na testosterona. E a testosterona é o hormônio que dá a ordem para a sua pele produzir óleo. Mais óleo, poro entupido, espinha. É por isso que a espinha sempre piora na semana antes da menstruação. Dois detalhes decidem se funciona. Primeiro: tem que ser hortelã mesmo, a comum. Menta e hortelã-pimenta são outras plantas, sem o mesmo efeito. Segundo: tem que ser duas xícaras, não uma. O pepino e o gelo estão aí só para transformar remédio em algo que dá vontade de beber. Se você está grávida, amamentando ou tentando engravidar, pule esse: como mexe com hormônio de verdade, ele não é inofensivo.',
    fonte:
      'Grant, Phytother Res 2010 (RCT, n=42, 2 xícaras/dia × 30 dias: queda significativa de testosterona livre e total, p<0,05); Akdoğan et al., Phytother Res 2007. Reduções relatadas: ~24% testosterona livre, ~29% total. ⚠️ ESPÉCIE: Mentha spicata (hortelã/spearmint), NÃO Mentha piperita (hortelã-pimenta). ⚠️ DOSE: 2 xícaras/dia. ⚠️ Contraindicado em gestação/lactação/tentativa de concepção. ⚠️ NOTA: é a versão "receita" da dica 5. Se as duas ficarem no catálogo, elas estão separadas por 12 dias de uso na fila — aceitável. Se preferir, corte a dica 5 e mantenha só esta.',
  },
  {
    ordem: 12,
    eyebrow: 'DICA DO DIA',
    titulo: 'Nunca esfregue o rosto com a toalha',
    corpo:
      'Dois problemas escondidos num gesto de dois segundos. O primeiro é o atrito: esfregar machuca a barreira da pele, e existe até nome para a espinha que nasce de atrito e pressão. O certo é dar tapinhas leves, sem arrastar. O segundo problema é a toalha em si. A do corpo não devolve só bactéria para o seu rosto. Ela devolve resto de hidratante corporal, de perfume e de creme de cabelo. Tudo isso vai direto para o seu poro. Você acabou de lavar o rosto: não suje ele de novo no último passo. Uma toalha só sua, só de rosto, trocada com frequência.',
    fonte:
      'Acne mecânica: fricção, pressão e oclusão agravam erupções acneiformes (fontes PubMed sobre acne mechanica); AAD recomenda limpeza suave e não abrasiva, alertando que esfregar com panos e esponjas irrita pele acneica. Voegeli, J Wound Ostomy Continence Nurs 2008 (práticas de secagem × função de barreira). Consenso dermatológico sobre higiene de toalha: lavar a cada uso ou no máx. a cada 3 usos; toalha compartilhada carrega resíduos de produtos além de microrganismos. ⚠️ Evidência indireta — mecanismo sólido, sem RCT específico de "toalha de rosto". Um dermatologista (Zeichner) ressalva que seria preciso pressão considerável para de fato danificar a barreira — por isso o texto não dramatiza.',
  },
  {
    ordem: 13,
    eyebrow: 'DICA DO DIA',
    titulo: 'Salada Retinol pra dar um glow na sua pele',
    ingredientes: [
      '4 cenouras: 2 assadas em rodelas e 2 cruas em fitas (descascador)',
      '1/2 abacate em fatias',
      'Coentro ou salsinha a gosto + 2 cebolinhas',
      '2 colheres de sopa de gergelim torrado',
      'MOLHO: 2 col. sopa de óleo de gergelim (ou azeite), 1 col. sopa de shoyu, 1 col. sopa de vinagre de arroz, suco de 1 limão, 1 dente de alho amassado, 1 cm de gengibre ralado',
    ],
    preparo: [
      'Corte 2 cenouras em rodelas e asse por 20 minutos.',
      'Faça fitas com as outras 2 cenouras, usando um descascador.',
      'Misture os ingredientes do molho numa tigela à parte.',
      'Junte tudo (a cenoura assada, as fitas cruas, o abacate e as ervas) e regue com o molho.',
      'Deixe marinar 15 minutos antes de comer. O ácido do limão amolece a fibra e solta mais pigmento.',
    ],
    corpo:
      'Essa salada viralizou na internet. Só que a versão que todo mundo copia tem um erro, e o erro está bem naquilo que dá nome a ela. Cenoura crua é o pior jeito de comer cenoura, se o que você quer é vitamina A: o pigmento fica trancado dentro dela e o seu corpo mal consegue tirar de lá. Cenoura assada, com um pouco de gordura junto? Aí sim ele sai. Por isso a nossa versão usa metade assada e metade crua: a assada entrega a vitamina de verdade, a crua entrega a crocância e a vitamina C, que o forno destruiria. O que a versão original acerta é o molho: sem gordura, esse pigmento não é absorvido. O óleo de gergelim ali não é tempero, é o que faz a salada funcionar. Uma xícara de cenoura já cobre a sua vitamina A do dia inteiro. E não exagere na dose diária, porque cenoura demais deixa a pele alaranjada.',
    fonte:
      'TREND: "retinol salad" (fitas de cenoura crua + molho asiático com óleo de gergelim, shoyu, vinagre de arroz, alho, limão), popularizada no TikTok; amplamente replicada por influencers. ⚠️ ERRO DA VERSÃO VIRAL — CORRIGIDO AQUI: a biodisponibilidade do beta-caroteno é MUITO menor na cenoura crua. Dados: ~11% (crua) vs ~75% (refogada com óleo) — Nutr Res Pract 2025 citando literatura; Hedrén et al./Livny et al.; van het Hof et al., J Nutr 1998 (biodisponibilidade menor em cru que em processado, em mulheres); Eur J Nutr 2003 (ileostomia: 65,1% absorvidos de cenoura cozida em purê vs 41,4% de cenoura crua picada). Suco fresco: 2,09x mais absorção que cenoura crua (RCT crossover, Nutr Res Pract 2025). GORDURA é requisito (beta-caroteno lipossolúvel) — a versão viral acerta isso por acaso, via óleo de gergelim. MARINAR: o ácido ajuda a romper a matriz celular. RDA: ~1 xícara de cenoura ≈ 100% da necessidade diária de vitamina A (1/2 xícara ≈ 51%). ⚠️ NOME é marketing: não há retinol, há beta-caroteno (pró-vitamina A) — mesma ressalva da dica 13. ⚠️ CAROTENEMIA: limitar a dose diária.',
  },
  {
    ordem: 14,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de mamão',
    ingredientes: [
      '3 colheres de sopa de mamão bem maduro amassado',
      '1 colher de chá de mel',
      '1 colher de sopa de aveia moída (opcional, para dar liga)',
    ],
    preparo: [
      'Se for a primeira vez, faça um teste: passe um pouco no antebraço e espere 24 horas.',
      'Amasse o mamão até virar um purê e misture o mel.',
      'Espalhe no rosto limpo e deixe agir de 10 a 15 minutos.',
      'Enxágue com água morna, sem esfregar e sem massagear.',
      'Use no máximo uma vez por semana.',
    ],
    corpo:
      'Essa máscara esfolia sem raspar nada da sua pele, e é aí que está a graça dela. O mamão tem uma enzima chamada papaína, a mesma que se usa para amaciar carne. O que ela faz é dissolver a cola que prende a pele morta na superfície. As células se soltam sozinhas. Sem grãozinho, sem esfregar, sem ácido. É por isso que ela é bem mais gentil do que aqueles esfoliantes de grão, que na prática arranham o seu rosto. O resultado é uma pele mais lisa, mais uniforme e que reflete melhor a luz: o famoso viço. Use o mamão bem maduro: o verde tem mais enzima, mas irrita mais. Uma vez por semana já basta. Esfoliar demais é o jeito mais rápido de estragar justamente a pele que você está tentando cuidar.',
    fonte:
      'PAPAÍNA (Carica papaya): enzima proteolítica que hidrolisa as ligações de queratina/proteína das células mortas do estrato córneo → esfoliação ENZIMÁTICA, sem abrasão mecânica nem acidez. Mais gentil à barreira que esfoliantes físicos ou ácidos de alta concentração. Evidência de atividade anti-inflamatória (Kwon et al., Antioxidants 2024 — papaína suprime inflamação cutânea atópica in vitro e in vivo). Papaína usada clinicamente em desbridamento de feridas/queimaduras. Máscaras faciais com papaína incorporada foram avaliadas para atividade esfoliante (Trevisol et al.). ⚠️ ALERGIA: papaína pode causar reação em pessoas alérgicas a LÁTEX, kiwi ou frutas tropicais — teste no antebraço é obrigatório na copy. ⚠️ FREQUÊNCIA: máx. 1–3x/semana; superexfoliação compromete a barreira. ⚠️ Mamão VERDE tem mais papaína (o látex) mas é mais irritante — a receita pede MADURO de propósito. Não usar sobre pele ferida.',
  },
  {
    ordem: 15,
    eyebrow: 'DICA DO DIA',
    titulo: 'Dê à sua pele um dia inteiro sem maquiagem (quanto mais melhor)',
    corpo:
      'Base e corretivo formam um filme por cima do poro. Ao longo do dia, esse filme se mistura com o seu próprio óleo e com a pele morta, e o poro, que já estava cheio, fica sem por onde respirar. Um dia inteiro sem nada em cima é o tempo que a pele usa para se desentupir sozinha. Não precisa ser um dia perfeito. Quantas horas você conseguir já valem. E uma surpresa: num estudo recente, o produto mais associado a espinha não foi a base. Foi o sabonete de limpeza. Vale dar uma olhada no rótulo do seu.',
    fonte:
      'Kligman & Mills 1972 (cunharam "acne cosmetica"); Choi et al., Clin Cosmet Investig Dermatol 2025 (case-control: limpadores faciais com ingredientes comedogênicos associados a risco 2,49x maior de acne). ⚠️ Evidência OBSERVACIONAL, não causal — o corpo do texto foi escrito com humildade, sem prometer resultado.',
  },
  {
    ordem: 16,
    eyebrow: 'DICA DO DIA',
    titulo: 'Shot Vitamina C',
    ingredientes: [
      '1 colher de sopa de polpa de acerola (~50 g)',
      '1/2 kiwi',
      'Suco de 1/2 limão',
      '1 colher de chá de chia',
      '1 pedaço pequeno de gengibre',
      '150 ml de água de coco',
    ],
    preparo: [
      'Bata todos os ingredientes.',
      'Deixe descansar 5 minutos, para a chia virar gel.',
      'Beba na hora. Vitamina C se perde com luz e calor. Esse não é de guardar.',
    ],
    corpo:
      'Enquanto as gringas do TikTok brigam por laranja, a campeã mundial está no congelador do mercado aqui do lado. A acerola tem trinta vezes mais vitamina C que a laranja. Trinta. E isso importa porque, sem vitamina C, o seu corpo simplesmente não fabrica colágeno: a fibra sai frouxa e se desmancha. O kiwi reforça a dose, o gengibre acalma a inflamação, e a chia é a parte esperta da receita: a fibra dela segura o açúcar da fruta, para o seu shot de beleza não virar oleosidade depois. Beba na hora: a vitamina C é frágil e se perde se ficar parada na geladeira.',
    fonte:
      'Acerola (Malpighia emarginata): ~1.677 mg vit. C/100 g vs. laranja ~53 mg/100 g. Kiwi verde ~93 mg/100 g. RDA mulher adulta = 75 mg. Pullar et al., Nutrients 2017 (vit. C como cofator de prolil/lisil hidroxilase na síntese de colágeno). A chia está AQUI de propósito: a fibra solúvel amortece o pico glicêmico da frutose da fruta (ver dica 1). Vit. C é termolábil e fotossensível → beber na hora. ⚠️ DIFERENCIAL COMPETITIVO: a acerola é barata e acessível no Brasil (polpa congelada) e está ausente de todas as receitas virais internacionais.',
  },
  {
    ordem: 17,
    eyebrow: 'DICA DO DIA',
    titulo: 'Mergulhe o rosto na água gelada por 30 segundos',
    corpo:
      'Esse é o truque de véspera: dia de foto, dia de evento, ou aquela manhã em que você acordou com o rosto inchado. O gelo fecha os vasinhos da pele, e o rosto desincha e para de ficar vermelho na hora. O efeito dura algumas horas. É aparência imediata, não é tratamento. Como fazer direito: rosto limpo, sem maquiagem e sem protetor, uma bacia com água e gelo, cerca de 30 segundos, nunca mais que 60. E nunca encoste o cubo de gelo direto na pele, porque gelo em contato direto queima. Se você tem rosácea ou a pele muito reativa, pule essa: nesses casos o frio piora.',
    fonte:
      '⚠️ SEM respaldo em literatura indexada (PubMed: nada relevante). Vasoconstrição pelo frio é fisiologia básica; o efeito é real mas TEMPORÁRIO (poucas horas) e puramente estético. Dermatologistas consultados em fontes clínicas convergem: 10–30 s, contraindicado em rosácea/eczema/pele reativa, risco de queimadura com gelo em contato direto, e possível rebote de oleosidade em pele acneica. O texto foi escrito para NÃO prometer tratamento — a honestidade aqui é intencional e protege a marca.',
  },
  {
    ordem: 18,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de babosa, a que apaga o estrago do sol',
    ingredientes: [
      '1 folha de babosa (aloe vera)',
      '1 colher de chá de mel',
      '1 colher de sopa de aveia moída (opcional, para engrossar)',
    ],
    preparo: [
      'Corte a folha e deixe-a escorrer de pé, dentro de um copo, por 15 minutos. Vai sair um líquido amarelo.',
      'Jogue esse líquido amarelo fora. Ele irrita a pele. Esse passo não é opcional.',
      'Lave bem a folha, abra ao meio e raspe o gel transparente de dentro.',
      'Bata o gel com o mel e aplique no rosto.',
      'Deixe agir 20 minutos e enxágue. O que sobrar guarda na geladeira por até 3 dias.',
    ],
    corpo:
      'A babosa não é conversa de avó: ela tem estudo. Num deles, o gel de babosa aliviou a dor de queimadura melhor do que o creme que o hospital usava. Ela acelera a cicatrização, acalma a vermelhidão e ajuda a pele a reconstruir a própria barreira. Ou seja: ela não só refresca, ela conserta. E é a máscara certa para o Brasil: o dia depois da praia, o rosto que ficou quente e vermelho, a pele que reclamou do sol. O passo mais importante é justamente o que quase ninguém faz: depois de cortar a folha, deixe ela escorrer de pé por uns 15 minutos. Vai sair um líquido amarelo, e esse líquido irrita a pele. Você quer o gel transparente de dentro, não o amarelo. Jogue o amarelo fora e lave bem a folha antes de raspar.',
    fonte:
      'ALOE VERA: revisões e ensaios clínicos sustentam uso tópico em cicatrização de feridas e queimaduras. Ensaio clínico: creme com aloe foi SUPERIOR à sulfadiazina de prata no alívio da dor em queimaduras de 2º grau superficiais. Estudo: extrato de aloe melhorou a hidratação cutânea, possivelmente por aumentar a expressão de proteínas de barreira (Life/MDPI 2025). Evidência clínica também em dermatite, prurido e dermatite por radiação; perfil de segurança favorável. ⚠️ CRÍTICO NA RECEITA CASEIRA: o látex amarelo logo abaixo da casca (rico em ALOÍNA) é IRRITANTE e laxativo — precisa ser drenado e a folha lavada antes de raspar o gel. Muitas receitas da internet omitem esse passo. ⚠️ A copy NÃO promete tratamento de queimadura — enquadra como calmante pós-sol, uso wellness.',
  },
  {
    ordem: 19,
    eyebrow: 'DICA DO DIA',
    titulo: 'Coma um kiwi hoje',
    corpo:
      'O seu corpo não consegue fabricar colágeno sem vitamina C. Isso não é força de expressão: sem ela, a fibra de colágeno sai frouxa e se desmancha. E aqui vai o que quase ninguém sabe: o kiwi tem quase o dobro de vitamina C da laranja. Um kiwi médio já cobre tudo o que você precisa no dia inteiro. Firmeza de pele não se compra só em pote: uma parte dela você come. Coma cru, porque a vitamina C não sobrevive ao calor.',
    fonte:
      'USDA: kiwi verde ~92,7 mg vit. C/100 g vs. laranja ~53 mg/100 g; kiwi gold ~161 mg/100 g. RDA para mulheres adultas = 75 mg. Pullar et al., Nutrients 2017 (vit. C como cofator de prolil/lisil hidroxilase na síntese de colágeno). Estudo de farmacocinética: absorção da vit. C do kiwi equivale à de suplemento sintético. ⚠️ PEPINO foi cortado do rascunho: ~95% água, teor de vit. C irrelevante, sem evidência de efeito cutâneo.',
  },
  {
    ordem: 20,
    eyebrow: 'DICA DO DIA',
    titulo: 'Shot Protetor: o único que a ciência mediu contra o sol',
    ingredientes: [
      '2 colheres de sopa de extrato de tomate (sim, o de lata)',
      '1/2 pimentão vermelho',
      '1 cenoura pequena',
      '1 fio generoso de azeite de oliva',
      'Suco de 1/2 limão',
      '1 pitada de sal e folhas de manjericão',
    ],
    preparo: [
      'Bata todos os ingredientes com um pouco de água gelada.',
      'Coe, se preferir mais liso.',
      'Beba como um gazpacho. Sim, esse é salgado, e é o mais científico da lista.',
    ],
    corpo:
      'Esse tem o número mais impressionante de todos: quem comeu tomate com azeite por 10 semanas ficou 40% menos vermelho ao se expor ao sol. Quarenta por cento. Quem faz isso é o licopeno, o pigmento vermelho do tomate, que funciona como uma defesa contra o estrago que o sol causa na pele. E agora a parte que ninguém espera: o tomate cozido tem mais licopeno aproveitável que o tomate cru. O calor quebra as paredes do tomate e solta o pigmento. É por isso que a receita pede extrato de lata e não tomate fresco. O azeite, de novo, é obrigatório: sem gordura, esse pigmento não entra. Mas fica combinado entre a gente: isso NÃO é protetor solar e não substitui o seu. É uma defesa extra, por dentro. O protetor continua sendo todo dia.',
    fonte:
      'Stahl et al., J Nutr 2001 (RCT: 40 g de pasta de tomate + 10 g de azeite/dia por 10 semanas → eritema induzido por UV 40% menor que o controle, p=0,02); Rizwan et al., Br J Dermatol 2011 (RCT: pasta de tomate rica em licopeno protege contra fotodano cutâneo in vivo); Aust et al. 2005 (bebida à base de tomate → proteção de até 48%). BIODISPONIBILIDADE: licopeno de tomate PROCESSADO/cozido > tomate cru (o calor rompe a matriz celular); requer gordura para absorção. ⚠️ A copy DEVE dizer que NÃO substitui protetor solar — obrigatório do ponto de vista de segurança e regulatório.',
  },
  {
    ordem: 21,
    eyebrow: 'DICA DO DIA',
    titulo: 'Caldo de ossos feito em casa',
    ingredientes: [
      '1 kg de ossos com cartilagem (osso buco, joelho, pé de galinha. A junta é onde está a gelatina)',
      '2 colheres de sopa de vinagre',
      '1 cebola, 1 cenoura, 2 talos de salsão',
      '4 dentes de alho + 2 folhas de louro',
      'Água até cobrir + sal e pimenta',
    ],
    preparo: [
      'Coloque os ossos e os legumes numa panela e cubra tudo com água.',
      'Junte o vinagre. Ele é que ajuda a soltar a gelatina do osso.',
      'Cozinhe em fogo bem baixo por 12 a 24 horas, ou 3 horas na panela de pressão.',
      'Coe e guarde na geladeira.',
      'Beba uma xícara quente em qualquer momento do dia, junto ou perto de alguma refeição. Só não tome em jejum.',
    ],
    corpo:
      'Esse vale muito mais fazer em casa do que comprar pronto: quando compararam os dois, o de caixinha tinha bem menos do que interessa. E fazer é mais fácil do que parece, desde que você escolha o osso certo. Vá de junta: osso buco, joelho, pé de galinha. É ali que está a gelatina. O vinagre entra porque ele ajuda a soltar essa gelatina do osso. O caldo é cheio de glicina, que é a matéria-prima que o seu corpo usa para fabricar colágeno e que também ajuda o sono a ficar mais fundo, e é dormindo fundo que a pele se reconstrói. E ainda vêm junto os minerais que saem do próprio osso. Tem um teste bonito para saber se você acertou: quando esfriar na geladeira, o caldo tem que tremer feito gelatina. Se ficou líquido feito água, deixe cozinhar mais tempo da próxima vez.',
    fonte:
      'Alcock, Shaw & Burke, Int J Sport Nutr Exerc Metab 2019: caldos COMERCIAIS têm concentrações de aminoácidos menores que os caseiros; e o caldo em geral entrega menos aminoácidos-chave (hidroxiprolina, glicina, prolina) do que um suplemento de colágeno, com alta variabilidade. ⚠️ POR ISSO a copy NÃO promete "o colágeno vai para a sua pele" (afirmação falsa — o colágeno é digerido em aminoácidos, não viaja íntegro) e NÃO cita dose. Ela ancora no que é verdadeiro: glicina (matéria-prima de colágeno), sono e minerais. GLICINA E SONO: Yamadera et al., Sleep Biol Rhythms 2007 (3 g antes de dormir → menor latência para o sono e para o sono de ondas lentas, medido em polissonografia); Inagawa 2006; Bannai 2012. ⚠️ Note que a copy menciona o efeito no sono SEM prescrever horário — decisão do Douglas, para não induzir desconforto gástrico noturno. Instrução: perto de uma refeição, nunca em jejum. VINAGRE: o ácido auxilia a extração de gelatina do osso. TESTE DA GELIFICAÇÃO: indicador prático real de extração de gelatina. COLÁGENO HIDROLISADO (suplemento, não é isto): meta-análises positivas (26 RCTs), MAS Myung & Park, Am J Med 2025 → estudos não financiados pela indústria mostraram efeito nulo. Não recomendar suplemento sem essa ressalva.',
  },
  {
    ordem: 22,
    eyebrow: 'DICA DO DIA',
    titulo: 'Beba 300 ml de água com limão e chia junto de uma refeição',
    corpo:
      'A chia é a peça-chave aqui, e ela tem um truque: no seu estômago, ela vira uma gelatina que segura o açúcar da comida. E aí está o ponto que quase ninguém liga um no outro: açúcar demais no sangue é o que faz a sua pele produzir mais óleo. Mais óleo, poro entupido, espinha. Por isso a hora importa: tome junto ou logo antes de uma refeição, para a chia poder segurar o açúcar daquela comida. Sozinha, às três da tarde, ela é só água.',
    fonte:
      'Mucilagem de chia reduz bioacessibilidade da glicose em até 66,7% (modelo gastrointestinal dinâmico simgi®, Food Res Int 2020); fibra viscosa achata o pico glicêmico pós-prandial. ⚠️ Meta-análise 2024 (8 ensaios) NÃO encontrou efeito da chia sobre glicemia de JEJUM/HbA1c/insulina — por isso a dica fala só do PICO PÓS-REFEIÇÃO, que é onde o efeito existe. ⚠️ A evidência de que beber mais água hidrata a pele de quem já bebe o normal é fraca (Skin Res Technol 2018) — a dica NÃO promete hidratação cutânea. O ALA da chia converte mal em EPA/DHA (~5%) — também não ancoramos em ômega-3.',
  },
  {
    ordem: 23,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de chá verde: passar funciona muito mais que beber',
    ingredientes: [
      '2 sachês de chá verde',
      '2 colheres de sopa de argila verde (ou de aveia moída, se a pele for seca)',
      '1 colher de chá de mel',
      'Um pouco de água morna',
    ],
    preparo: [
      'Faça um chá verde bem forte, com pouca água, e deixe esfriar.',
      'Abra os sachês e aproveite também as folhas úmidas de dentro.',
      'Misture o chá e as folhas com a argila e o mel, até virar uma pasta.',
      'Espalhe no rosto e deixe agir 15 minutos.',
      'Enxágue antes que resseque por completo. Use uma ou duas vezes por semana.',
    ],
    corpo:
      'Aqui vai um dado que vira do avesso o que todo mundo faz: quando juntaram os estudos sobre chá verde e espinha, viram que passar na pele funciona muito mais do que beber. O chá bebido quase não mudou nada. O chá passado no rosto reduziu bastante as espinhas inflamadas. Quem faz esse trabalho é o antioxidante principal do chá verde, e ele ataca a espinha por três caminhos ao mesmo tempo: diminui a produção de óleo, acalma a inflamação e atrapalha a bactéria que vive dentro do poro entupido. A argila entra para chupar o excesso de óleo, e o mel para acalmar. É a máscara do rosto oleoso e com espinha, e custa dois sachês de chá.',
    fonte:
      'Kim & Park, Phytother Res 2020 (revisão sistemática + meta-análise de 5 RCTs, n=247): chá verde TÓPICO reduziu lesões inflamatórias em −11,39 (IC 95%: −15,91 a −6,86), enquanto o ORAL teve efeito mínimo (−1,40) — a inversão é REAL e é o gancho da dica. Saric & Sivamani, Antioxidants 2017 (revisão: polifenóis do chá tópicos reduzem secreção de sebo e tratam acne). Creme com 1% de EGCG por 8 semanas: reduções expressivas de lesões inflamatórias e não inflamatórias. Extrato tópico de chá verde a 5% por 60 dias: redução significativa de sebo. MECANISMO do EGCG: inibe a via PI3K-Akt-mTORC1 (que induz a produção de sebo), reduz lipogênese nos sebócitos, inibe o crescimento de C. acnes e a inflamação por ele causada. ⚠️ A concentração de um chá caseiro é MENOR que a dos cremes dos estudos — a copy não promete equivalência. ARGILA: absorção de sebo (evidência cosmética modesta, alegação mantida branda).',
  },
  {
    ordem: 24,
    eyebrow: 'DICA DO DIA',
    titulo: 'Tome DUAS xícaras de chá de hortelã hoje',
    corpo:
      'Essa dica tem estudo com nome e sobrenome. Mulheres que tomaram chá de hortelã duas vezes por dia durante um mês tiveram uma queda de cerca de 24% na testosterona. E a testosterona é justamente o hormônio que dá a ordem para a sua pele produzir óleo. É por isso que a espinha sempre piora na semana antes da menstruação. Dois detalhes decidem se vai funcionar. Primeiro: tem que ser hortelã mesmo, a comum de fazer chá. Menta e hortelã-pimenta são outras plantas e não fazem o mesmo efeito. Segundo: tem que ser duas xícaras, não uma. Foi essa a dose do estudo. Se você está grávida, amamentando ou tentando engravidar, pule essa: como mexe com hormônio de verdade, ela não é inofensiva.',
    fonte:
      'Grant, Phytother Res 2010 (RCT, n=42, 2 xícaras/dia por 30 dias: queda significativa de testosterona livre e total, p<0,05); Akdoğan et al., Phytother Res 2007 (queda de ~30% na testosterona livre). Reduções relatadas: ~24% testosterona livre, ~29% total. ⚠️ DOSE CORRIGIDA: os RCTs usaram 2x/dia, não 1x. ⚠️ ESPÉCIE: Mentha spicata (hortelã/spearmint), NÃO Mentha piperita (hortelã-pimenta/peppermint). ⚠️ Contraindicação em gestação/lactação/tentativa de concepção.',
  },
  {
    ordem: 25,
    eyebrow: 'DICA DO DIA',
    titulo: 'Shot Verde: zero açúcar, gordura boa',
    ingredientes: [
      '1 punhado de couve (sem o talo)',
      '1/4 de abacate',
      '1/2 pepino',
      'Suco de 1 limão',
      '1 pedaço de gengibre',
      'Folhas de hortelã + 200 ml de água gelada',
    ],
    preparo: [
      'Bata todos os ingredientes até ficar cremoso.',
      'Não precisa coar: a fibra do abacate e da couve é parte do plano.',
      'Beba na hora.',
    ],
    corpo:
      'Esse é o único sem nenhuma fruta doce, e isso é de propósito: é o shot do dia em que você já comeu açúcar demais. A couve traz os pigmentos verdes, que também se acumulam na pele e ajudam a defendê-la. Mas a estrela aqui é o abacate, e não pelo motivo que você imagina. Todos esses pigmentos (o da couve, o da cenoura, o do tomate) só entram no seu corpo junto com gordura. O abacate é essa gordura. E ele ainda traz vitamina E, que trabalha em dupla com a vitamina C. O limão ajuda no aproveitamento, o gengibre acalma, e a hortelã está ali porque couve pura é um castigo. É o mais completo da lista, e o único que você pode tomar todo dia sem pensar duas vezes.',
    fonte:
      'Luteína/zeaxantina (couve): carotenoides que se depositam na pele; carotenoides dietéticos alteram a coloração cutânea (Stephen et al., PLOS One 2015). Abacate: gordura monoinsaturada + vitamina E (tocoferol). A coingestão de gordura é REQUISITO para a absorção de carotenoides lipossolúveis — o abacate é o "veículo" da receita. Vit. E e vit. C atuam de forma complementar (fase lipídica × fase aquosa). Zero fruta doce = zero conflito com a dica 2. ⚠️ É o shot mais seguro para consumo diário: sem risco de carotenemia (não tem beta-caroteno concentrado) e sem carga glicêmica.',
  },
  {
    ordem: 26,
    eyebrow: 'DICA DO DIA',
    titulo: 'Máscara facial de abacate para quando a pele está repuxando',
    ingredientes: [
      '1/2 abacate bem maduro',
      '1 colher de chá de mel',
      '1 colher de chá de azeite de oliva',
      '1 colher de sopa de iogurte natural (opcional)',
    ],
    preparo: [
      'Amasse o abacate até ficar bem cremoso, sem nenhum pedaço.',
      'Misture o mel e o azeite.',
      'Aplique uma camada generosa no rosto e deixe agir 20 minutos.',
      'Retire com água morna. Use uma ou duas vezes por semana, ou sempre que a pele estiver repuxando.',
    ],
    corpo:
      'Essa é a máscara do inverno, do ar-condicionado e do dia seguinte ao ácido. Nem toda pele está precisando de mais um ativo. Às vezes ela só está precisando de gordura. O abacate é cheio de gordura boa e de vitamina E, um antioxidante que age justamente na parte gordurosa da pele, onde a vitamina C não chega. As duas se completam. O mel puxa água para dentro da pele, e o azeite fecha por cima para essa água não escapar. É a lógica de uma rotina inteira dentro de um pote só: primeiro puxa a água, depois não deixa ela ir embora. Se a sua pele anda áspera, opaca e repuxando depois da limpeza, é essa aqui que você quer.',
    fonte:
      'ABACATE: rico em ácidos graxos monoinsaturados e em vitamina E (tocoferol) — antioxidante LIPOSSOLÚVEL, complementar à vitamina C (hidrossolúvel): atuam em fases diferentes (lipídica × aquosa). Emoliente: preenche os espaços entre corneócitos, melhora textura e maciez. MEL: umectante (atrai água) + atividade antibacteriana. AZEITE: emoliente/oclusivo leve, ajuda a reduzir a perda de água transepidérmica (menos potente que o petrolato — ver dica 11 — mas adequado como camada final de uma máscara). LÓGICA DA FORMULAÇÃO (explicitada na copy): umectante puxa água + oclusivo/emoliente retém — é o princípio de qualquer boa hidratação. ⚠️ Evidência de eficácia é MECANICISTA e cosmética, não clínica — copy escrita sem promessa de resultado mensurável, apenas conforto e maciez. ⚠️ Em pele muito acneica, óleos vegetais podem ser comedogênicos para algumas pessoas — posicionada como máscara de pele SECA/repuxando.',
  },
];

/**
 * ============================================================
 * NOTA — CATEGORIA "RECEITA" / "SHOT NIKS"
 * ============================================================
 * A dica 8 é uma RECEITA, não uma alegação terapêutica. Isso é deliberado e importa:
 * as duas grandes meta-análises DISCORDAM sobre iogurte e acne (Clin Nutr 2019 → sem
 * associação; Nutrients 2018, n=78.529 → OR 1,36, significativo). Como a copy não afirma
 * que iogurte trata acne — só monta um prato cujos ingredientes têm função — o catálogo
 * não fica preso nessa briga. A dica 10, por sua vez, fala só de LEITE LÍQUIDO.
 *
 * "RECEITA" é uma boa categoria para expandir: pratos gostosos e simples, com o porquê de
 * cada ingrediente. Bom antídoto contra o catálogo virar uma lista de proibições.
 *
 * ============================================================
 * ❌ DICA 13 DO RASCUNHO (saquinho de camomila no rosto) — NÃO INCLUÍDA
 * ============================================================
 * A camomila (Matricaria) é da família Asteraceae — a mesma da margarida e da ambrósia —
 * e é causa CLÁSSICA de dermatite de contato alérgica. A dica mandaria uma usuária com a
 * pele já inflamada encostar o alérgeno justamente na área inflamada. Somado a isso, o
 * saquinho úmido em temperatura ambiente é meio de cultura para bactéria.
 *
 * A ação anti-inflamatória da apigenina e do bisabolol é real (Front Immunol 2024), mas o
 * risco/benefício não fecha para uma recomendação em massa, sem triagem individual.
 *
 * Se o Douglas quiser mantê-la, ela precisa de salvaguarda explícita no corpo (chá coado,
 * frio, algodão limpo e descartável, teste no antebraço 24h antes) — e ainda assim seria a
 * dica mais arriscada do catálogo.
 */