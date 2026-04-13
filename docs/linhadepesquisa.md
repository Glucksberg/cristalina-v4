# Cristalina v4
## Linha de Pesquisa

**Status:** Exploratory  
**Last reviewed:** 2026-04-13  
**Purpose:** manter um mapa vivo de pesquisa para orientar o desenvolvimento do projeto a partir de evidências públicas, sem deixar que a arquitetura derive apenas de intuição, moda de framework ou claims de benchmark isolados.

---

## 1. Por que este documento existe

Este documento não substitui contratos do repositório.

Ele existe para:

- registrar a linha de pesquisa que sustenta a direção do projeto
- mostrar por que Cristalina v4 está mais próxima das linhas abertas mais sérias do campo do que de uma memória rasa baseada apenas em vetor + similaridade
- acompanhar papers, benchmarks e stacks abertos que ajudam a calibrar prioridades
- manter o projeto ancorado em evidência pública conforme o campo evolui

Ele complementa especialmente:

- [VISION.md](./VISION.md)
- [NEXT-GEN-MEMORY-SYNTHESIS.md](./NEXT-GEN-MEMORY-SYNTHESIS.md)
- [ANCESTOR-CROSSWALK.md](./ANCESTOR-CROSSWALK.md)
- [RUNTIME-IDENTITY.md](./RUNTIME-IDENTITY.md)
- [DISPOSITION-AND-CONSOLIDATION.md](./DISPOSITION-AND-CONSOLIDATION.md)
- [EVALS.md](./EVALS.md)

---

## 2. Leitura atual

A leitura de abril de 2026 é favorável à direção de Cristalina v4.

O campo aberto mais forte não está convergindo para "um banco vetorial melhor".
Está convergindo para:

- separação entre memória de trabalho e memória durável
- distinção entre autobiografia operacional, fatos estáveis, episódios e procedimentos
- tratamento explícito de tempo, mudança e invalidação
- reconsolidação não destrutiva
- governança separada da camada gerativa
- avaliação mais próxima de uso real, inclusive memória para agir, esquecer seletivamente e atravessar múltiplas sessões

Isso coincide de forma direta com a tese já descrita neste repositório:

- runtime self real, não apenas histórico de chat
- world model temporal separado de canon
- canon governado separado de runtime e wiki
- promoção, supersession, proveniência e auditabilidade acima da conveniência de retrieval

Em outras palavras: Cristalina v4 não está tentando inventar uma direção exótica fora da curva.
Ela está tentando combinar, com mais rigor de governança, justamente as linhagens abertas que hoje parecem mais promissoras.

---

## 3. Sinal das surveys recentes

As surveys recentes reforçam que o campo já ultrapassou a taxonomia simplista de "short-term vs long-term memory".

| Trabalho | Sinal principal | Relevância para Cristalina |
|---|---|---|
| [Human-inspired Perspectives: A Survey on AI Long-term Memory](https://arxiv.org/abs/2411.00489) | mapeia memória de IA contra categorias cognitivas humanas e propõe uma arquitetura orientadora | reforça a separação entre memória episódica, semântica e mecanismos de adaptação |
| [Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions](https://arxiv.org/abs/2505.00675) | reorganiza o campo por operações como consolidação, updating, indexing, forgetting, retrieval e compression | casa bem com a postura de Cristalina de tratar write path e legality of transitions como arquitetura, não detalhe |
| [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers](https://arxiv.org/abs/2603.07670) | trata memória como loop write-manage-read e taxonomia de escopo temporal, substrato representacional e política de controle | é muito próxima da ideia de layers + governance + evals deste repositório |

Síntese útil:

- memória é uma arquitetura de escrita, gestão e leitura
- tipo de memória e estado de verdade não são o mesmo eixo
- forgetting, updating e contradiction handling já são temas centrais, não periféricos

---

## 4. Linhagens abertas que parecem mais maduras

### 4.1 Núcleo ancestral mais alinhado com este projeto

| Linha | O que ela realmente traz | Por que importa aqui | Cuidado |
|---|---|---|---|
| [Letta](https://docs.letta.com/) / [repo](https://github.com/letta-ai/letta) | agentes stateful, memory blocks sempre visíveis, memória editável distinta de archival memory, `AgentFile (.af)`, `MemFS` git-backed e experiências de sleep-time agents | valida a ideia de runtime self persistente, bloco de persona/human, checkpointing e portabilidade da mente operacional | memória editável de runtime não deve virar autoridade canônica por conveniência |
| [Zep / Graphiti](https://github.com/getzep/graphiti) e [paper](https://arxiv.org/abs/2501.13956) | grafo temporal com validade, episódios como raiz de proveniência, invalidation em vez de overwrite, queries históricas e retrieval híbrido | confirma a necessidade de world model temporal com claims, janelas de validade, contradição histórica e lineagem | grafo temporal não resolve sozinho promotion law nem canon governado |
| [Mem0](https://docs.mem0.ai/core-concepts/memory-types) e [OSS overview](https://docs.mem0.ai/open-source/overview) | camadas explícitas de conversation, session, user e organizational memory; write/read pragmáticos; OSS self-hosted | reforça que escopo e lifetime de memória são decisões de arquitetura, não apenas filtros de busca | é mais pragmático do que ontologicamente forte; não resolve identidade contínua por si só |
| [LangGraph memory](https://docs.langchain.com/oss/python/langgraph/memory) + [LangMem](https://github.com/langchain-ai/langmem) | namespaces, store hierárquico, distinção semântica/episódica/procedural, hot path vs background writes, background memory manager | mostra um kit composável para separar storage, tipo de memória e política de update | entrega primitives, não uma constituição pronta; sem governança adicional o sistema deriva fácil |

### 4.2 Sinal de maturidade em detalhes específicos

Alguns detalhes públicos desses ancestrais importam bastante para este projeto:

- Letta separa `system prompt` de blocos editáveis como `persona` e `human`, o que ajuda a pensar runtime identity como algo parcialmente estável e parcialmente evolutivo.
- Letta também trata agente como artefato portátil via [`AgentFile (.af)`](https://docs.letta.com/guides/core-concepts/agent-file) e organiza memória de código em [`MemFS`](https://docs.letta.com/letta-code/memory/), o que é útil para projeções runtime-portable.
- Graphiti modela fatos com validity windows e mantém proveniência até episódios, aproximando bastante a tese de `world/episodes`, `world/claims` e inspeção do histórico perdedor.
- Mem0 documenta de forma explícita quando algo deve viver como conversation, session, user ou organizational memory, o que ajuda a não colapsar escopos.
- LangGraph/LangMem tratam memória procedural de forma explícita e distinguem update no hot path de consolidação em background.

---

## 5. Projetos abertos úteis, mas mais especializados

| Projeto | Sinal principal | Leitura útil |
|---|---|---|
| [Memobase](https://github.com/memodb-io/memobase) | backend de perfil e contexto de usuário, com flush assíncrono e reconstrução de contexto | bom para perfil persistente e eventos recentes; menos forte em identidade moral ou world model temporal |
| [Cognee](https://github.com/topoteretes/cognee) | knowledge engine com vetores + grafo + contexto relacional evolutivo | útil como referência de knowledge engine, mas menos centrado em governança constitucional |
| [Kernel Memory](https://github.com/microsoft/kernel-memory) | memória para usuários, times e apps, mais próxima de documentos e dados do que de autobiografia de agente | relevante como infra aberta, mas não como ancestral principal de identidade contínua |
| [AGIResearch MemOS](https://github.com/agiresearch/MemOS) | memory layer leve para agentes | útil como sinal de abstração de memória, mas ainda raso frente às necessidades de world law |
| [BAI-LAB MemoryOS](https://github.com/BAI-LAB/MemoryOS) | linha mais ambiciosa de "OS de memória" para agentes personalizados | vale acompanhar pela ambição arquitetural |
| [MemTensor MemOS](https://github.com/MemTensor/MemOS) | framework mais amplo de memory OS com múltiplos tipos de memória | confirma o movimento do campo em direção a memory management como sistema |

Nota importante:

O nome `MemOS` ou `MemoryOS` já está sendo usado por linhas diferentes.
Qualquer leitura futura desse espaço deve sempre desambiguar qual projeto e qual paper estão sendo referidos.

---

## 6. Frontier research que vale acompanhar

### 6.1 Linha diretamente citada no brainstorm inicial

| Trabalho | O que empurra na fronteira | O que sugere para Cristalina |
|---|---|---|
| [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110) | memória agentic inspirada em Zettelkasten, com notas estruturadas, linking dinâmico e evolução de memórias antigas | reforça que memórias não devem ser apenas armazenadas; elas precisam poder ser recontextualizadas e reindexadas |
| [HiMem: Hierarchical Long-Term Memory for LLM Long-Horizon Agents](https://arxiv.org/abs/2601.06377) | separa `Episode Memory` e `Note Memory`, liga eventos concretos a conhecimento estável e inclui reconsolidação conflitual | muito alinhado com a separação entre episódios, claims, consolidação e revisão não destrutiva |
| [LightMem: Lightweight and Efficient Memory-Augmented Generation](https://arxiv.org/abs/2510.18866) | memória em estágios com sensory memory, short-term topic-aware e long-term memory com sleep-time update | reforça a ideia de consolidação offline/periódica em vez de empurrar todo o custo para o hot path |
| [Agent Workflow Memory](https://arxiv.org/abs/2409.07429) | induz workflows reutilizáveis a partir de experiências, ou seja, memória procedural explícita | abre uma direção concreta para Cristalina não depender apenas de fatos e episódios |
| [Governing Evolving Memory in LLM Agents (SSGM)](https://arxiv.org/abs/2603.11768) | desacopla evolução da memória da execução com verificação de consistência, decay temporal e dynamic access control | quase toca diretamente a tese de governança deste repositório |
| [Memory as Ontology: A Constitutional Memory Architecture for Persistent Digital Citizens](https://arxiv.org/abs/2603.04740) | trata memória como base ontológica da continuidade do agente, com constituição acima do modelo gerativo | é um dos sinais públicos mais fortes de que identidade contínua exige memória constitucional, não só persona prompt |
| [Animesis](https://animesis.ai/) | projeto em torno de continuidade identitária, memória constitucional e desacoplamento entre memória e modelo | vale acompanhar como laboratório conceitual e de produto, mas ainda deve ser lido com cuidado como linha arquitetural, não como infraestrutura madura comprovada |

### 6.2 Sinais adjacentes de 2026 que merecem monitoramento

Esses trabalhos não estavam no texto inicial, mas são próximos o suficiente para entrar no radar:

- [All-Mem](https://arxiv.org/abs/2603.19595): consolidação não destrutiva com operações explícitas `SPLIT`, `MERGE` e `UPDATE`, preservando evidência imutável.
- [E-mem](https://arxiv.org/abs/2601.21714): troca preprocessamento destrutivo por reconstrução episódica de contexto.
- [ProcMEM](https://arxiv.org/abs/2602.01869): procedural memory com skills executáveis, condições de ativação e manutenção compacta.
- [APEX-EM](https://arxiv.org/abs/2603.29093): experiência procedural-episódica estruturada com exemplos positivos e negativos.
- [TiMem](https://arxiv.org/abs/2601.02845): consolidação temporal-hierárquica com árvore de memória temporal.

Essas linhas sugerem uma direção importante:

- memória de agente está deixando de ser apenas "fatos sobre o usuário"
- memória procedural, reconsolidação e atualização tipada estão virando parte central da arquitetura

---

## 7. Identidade contínua e memória moral

Aqui o campo ainda está menos maduro que em recuperação factual ou memória temporal.

O padrão mais sólido em aberto hoje parece ser:

- um núcleo mais estável de instruções, disposições ou constituição
- uma autobiografia operacional editável
- uma camada histórica auditável
- mecanismos separados para governar promoção, revisão e acesso

O que isso sugere para Cristalina v4:

- identidade não deve ser só `persona`
- "quem o agente é" e "o que aconteceu com ele" não são a mesma camada
- valores, limites e disposições não devem competir no mesmo plano de escrita dos episódios cotidianos
- memória moral precisa de governança mais rígida do que memória autobiográfica comum

A fronteira mais séria hoje não está em "consciência" no sentido forte.
Ela está em:

- continuidade autobiográfica
- constituição estável
- governança de mudanças
- portabilidade da identidade quando o modelo subjacente muda

Esse é exatamente o espaço onde Cristalina pode ser mais original se mantiver a separação entre runtime, world, canon e policy/disposition.

---

## 8. Benchmarks que importam

| Benchmark | O que mede | Por que importa |
|---|---|---|
| [LongMemEval](https://arxiv.org/abs/2410.10813) | extração de informação, raciocínio multi-sessão, raciocínio temporal, knowledge updates e abstention | útil para testar mudança temporal e recusa correta, não só recuperação factual |
| [LoCoMo](https://arxiv.org/abs/2402.17753) | conversas muito longas com cerca de 300 turns, média de 9k tokens, até 35 sessões, além de QA, sumarização e diálogo multimodal | força o sistema a provar continuidade conversacional real |
| [MemoryAgentBench](https://openreview.net/forum?id=DT7JyQC3MR) | retrieval correto, test-time learning, long-range understanding e selective forgetting | é relevante porque já trata forgetting como competência, não falha colateral |
| [Mem2ActBench](https://arxiv.org/abs/2601.19935) | uso proativo de memória para agir em tarefas com ferramentas e parâmetros | importante para não otimizar só QA e esquecer ação runtime |

Leitura prática:

- benchmark nenhum resolve o problema sozinho
- claim de "SOTA memory" precisa ser lido contra o que o benchmark mede
- Cristalina precisa avaliar ao menos tempo, conflito, promoção, abstention e ação

---

## 9. O que isso implica para Cristalina v4

### 9.1 Coisas que parecem cada vez mais corretas

- manter `runtime self` como layer real
- tratar episódios como raiz de proveniência
- representar claims temporais com invalidation, não overwrite silencioso
- separar world state de canon ratificado
- manter policy/disposition como substrato distinto de memória comum
- consolidar fora do hot path quando a operação for cara ou jurisprudencial
- preservar o histórico do claim perdedor em qualquer fluxo de contradição

### 9.2 Coisas que o projeto não deveria fazer

- colapsar tudo em um índice vetorial único
- deixar adapters definirem semântica de memória
- permitir que edição runtime equivalente a conveniência vire verdade durável
- tratar wiki, profile ou graph como se fossem automaticamente canon
- expandir surface area antes de o write path temporal e governado estar sólido

### 9.3 Próximas perguntas úteis para expandir este documento

- qual parte da identidade deve ser runtime-editable e qual parte deve ser constitucional
- como representar procedural memory sem contaminar canon factual
- quando uma contradição deve abrir proposal, supersession temporal ou simples ajuste de projection
- quais slices de LongMemEval, LoCoMo, MemoryAgentBench e Mem2ActBench podem virar fixtures e evals internas deste repositório
- qual forma mínima de governança é suficiente para "memória moral" sem travar o sistema inteiro

---

## 10. Síntese em uma frase

Se a hipótese de Cristalina v4 for mantida, o projeto deve se posicionar como uma síntese disciplinada entre:

- runtime self persistente no espírito de Letta
- world memory temporal no espírito de Zep/Graphiti
- escopos pragmáticos de memória no espírito de Mem0
- primitives composáveis no espírito de LangGraph/LangMem
- e governança constitucional mais forte do que qualquer uma dessas linhas costuma entregar por padrão

---

## 11. Índice inicial de fontes

### 11.1 Stacks abertos

- Letta docs: https://docs.letta.com/
- Letta memory blocks: https://docs.letta.com/guides/agents/memory-blocks/
- Letta AgentFile: https://docs.letta.com/guides/core-concepts/agent-file
- Letta MemFS: https://docs.letta.com/letta-code/memory/
- Letta repo: https://github.com/letta-ai/letta
- Graphiti repo: https://github.com/getzep/graphiti
- Zep paper: https://arxiv.org/abs/2501.13956
- Mem0 memory types: https://docs.mem0.ai/core-concepts/memory-types
- Mem0 OSS overview: https://docs.mem0.ai/open-source/overview
- LangGraph memory docs: https://docs.langchain.com/oss/python/langgraph/memory
- LangMem repo: https://github.com/langchain-ai/langmem
- Memobase repo: https://github.com/memodb-io/memobase
- Cognee repo: https://github.com/topoteretes/cognee
- Kernel Memory repo: https://github.com/microsoft/kernel-memory
- AGIResearch MemOS repo: https://github.com/agiresearch/MemOS
- BAI-LAB MemoryOS repo: https://github.com/BAI-LAB/MemoryOS
- MemTensor MemOS repo: https://github.com/MemTensor/MemOS

### 11.2 Frontier research

- A-MEM: https://arxiv.org/abs/2502.12110
- HiMem: https://arxiv.org/abs/2601.06377
- LightMem: https://arxiv.org/abs/2510.18866
- Agent Workflow Memory: https://arxiv.org/abs/2409.07429
- SSGM: https://arxiv.org/abs/2603.11768
- Memory as Ontology: https://arxiv.org/abs/2603.04740
- Animesis: https://animesis.ai/
- All-Mem: https://arxiv.org/abs/2603.19595
- E-mem: https://arxiv.org/abs/2601.21714
- ProcMEM: https://arxiv.org/abs/2602.01869
- APEX-EM: https://arxiv.org/abs/2603.29093
- TiMem: https://arxiv.org/abs/2601.02845

### 11.3 Surveys e benchmarks

- Human-inspired Perspectives survey: https://arxiv.org/abs/2411.00489
- Rethinking Memory in AI: https://arxiv.org/abs/2505.00675
- Memory for Autonomous LLM Agents: https://arxiv.org/abs/2603.07670
- LongMemEval: https://arxiv.org/abs/2410.10813
- LongMemEval repo: https://github.com/xiaowu0162/LongMemEval
- LoCoMo: https://arxiv.org/abs/2402.17753
- MemoryAgentBench: https://openreview.net/forum?id=DT7JyQC3MR
- MemoryAgentBench repo: https://github.com/HUST-AI-HYZ/MemoryAgentBench
- Mem2ActBench: https://arxiv.org/abs/2601.19935
