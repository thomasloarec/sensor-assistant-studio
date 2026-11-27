import { LEVEL_REQUIREMENT_MESSAGES } from "../src/lib/level/requirements";
// Catalogue order: English, Chinese, German, Spanish, Russian, Italian, Japanese.
const translations: Record<keyof typeof LEVEL_REQUIREMENT_MESSAGES,string[]> = {
  empty:[
    "Describe the level to detect or choose a goal. Standex can help clarify the need; no family is selected at random.",
    "请描述要检测的液位或选择目标。Standex可以帮助明确需求，不会随机选择产品系列。",
    "Beschreiben Sie den zu erkennenden Füllstand oder wählen Sie ein Ziel. Standex hilft bei der Klärung; es wird keine beliebige Baureihe gewählt.",
    "Describa el nivel que desea detectar o elija un objetivo. Standex puede ayudarle a precisarlo; no se selecciona una familia al azar.",
    "Опишите нужный уровень или выберите цель. Standex поможет уточнить задачу; серия не выбирается случайно.",
    "Descrivere il livello da rilevare o scegliere un obiettivo. Standex può aiutare a chiarire il bisogno; nessuna famiglia viene scelta a caso.",
    "検出する液位を説明するか、目的を選んでください。Standexが要件の整理を支援します。シリーズを無作為には選びません。"],
  scope:[
    "This request does not describe a sensing project. Clarify the sensor need to continue with Standex.",
    "该请求未描述传感器项目。请明确检测需求，以便与Standex继续研究。",
    "Diese Anfrage beschreibt kein Sensorprojekt. Klären Sie den Erfassungsbedarf, um mit Standex fortzufahren.",
    "Esta solicitud no describe un proyecto de detección. Aclare la necesidad del sensor para continuar con Standex.",
    "Запрос не описывает задачу обнаружения. Уточните потребность в датчике для продолжения со Standex.",
    "La richiesta non descrive un progetto di rilevamento. Chiarire il bisogno di un sensore per proseguire con Standex.",
    "この依頼には検出用途が記載されていません。Standexで検討を進めるため、センサーの用途を明確にしてください。"],
  solid:[
    "The text describes a solid, while this journey studies a float in liquid. Clarify the medium; Standex can investigate another sensing architecture.",
    "文字描述的是固体，而此流程研究液体中的浮子。请明确介质；Standex可以研究其他检测结构。",
    "Der Text beschreibt einen Feststoff, dieser Ablauf untersucht einen Schwimmer in Flüssigkeit. Klären Sie das Medium; Standex kann eine andere Sensorarchitektur prüfen.",
    "El texto describe un sólido, pero este recorrido estudia un flotador en un líquido. Aclare el medio; Standex puede estudiar otra arquitectura.",
    "В тексте указан твёрдый материал, а этот раздел рассматривает поплавок в жидкости. Уточните среду; Standex может изучить другую конструкцию.",
    "Il testo descrive un solido, mentre questo percorso studia un galleggiante in un liquido. Chiarire il mezzo; Standex può studiare un’altra architettura.",
    "記述は固体を示していますが、このフローは液中のフロートを扱います。媒体を確認してください。Standexで別の検出構成を検討できます。"],
  goal:[
    "The text and selected level conflict. Confirm which level or levels to detect; your answers are preserved.",
    "文字与所选液位冲突。请确认要检测的液位；原始回答会保留。",
    "Text und gewählter Füllstand widersprechen sich. Bestätigen Sie die zu erkennenden Niveaus; Ihre Antworten bleiben erhalten.",
    "El texto contradice el nivel elegido. Confirme los niveles que desea detectar; sus respuestas se conservan.",
    "Текст противоречит выбранному уровню. Подтвердите нужные уровни; ответы сохранены.",
    "Il testo e il livello scelto si contraddicono. Confermare i livelli da rilevare; le risposte restano conservate.",
    "記述と選択した液位が矛盾しています。検出する液位を確認してください。回答は保持されます。"],
  inferred:[
    "The high or low direction in this illustration comes from your description. Unknown dimensions remain assumptions to confirm.",
    "此示意图的高位或低位方向来自您的描述。未知尺寸仍是待确认的假设。",
    "Die Hoch-/Niedrigrichtung der Darstellung stammt aus Ihrer Beschreibung. Unbekannte Maße bleiben zu bestätigende Annahmen.",
    "El sentido alto o bajo de la ilustración procede de su descripción. Las dimensiones desconocidas son hipótesis por confirmar.",
    "Верхний или нижний уровень на схеме взят из вашего описания. Неизвестные размеры остаются предположениями для подтверждения.",
    "Il livello alto o basso nell’illustrazione deriva dalla descrizione. Le dimensioni sconosciute restano ipotesi da confermare.",
    "図の高位・低位の方向は説明文に基づきます。不明な寸法は確認が必要な仮定です。"],
  access:[
    "The text and selected access conflict. Confirm the available opening before choosing a mounting arrangement.",
    "文字与所选安装入口冲突。在确定安装方式前，请确认可用开口。",
    "Text und gewählter Zugang widersprechen sich. Bestätigen Sie die verfügbare Öffnung vor der Wahl der Montage.",
    "El texto contradice el acceso elegido. Confirme la abertura disponible antes de elegir el montaje.",
    "Текст противоречит выбранному доступу. Подтвердите доступное отверстие до выбора монтажа.",
    "Il testo e l’accesso scelto si contraddicono. Confermare l’apertura disponibile prima di scegliere il montaggio.",
    "記述と選択したアクセス方法が矛盾しています。取付方式を決める前に利用可能な開口を確認してください。"],
  magnetic:[
    "The float operates a contact using a magnet. Clarify where magnetic fields are forbidden: Standex can study a remote magnet and sensor, a support or a mechanical linkage, without guaranteeing feasibility.",
    "浮子通过磁铁驱动触点。请明确禁止磁场的区域：Standex可研究远置磁铁与传感器、支架或机械连杆，但不保证可行性。",
    "Der Schwimmer betätigt einen Kontakt mit einem Magneten. Klären Sie, wo Magnetfelder verboten sind: Standex kann versetzte Magnete und Sensoren, Halter oder mechanische Kopplungen prüfen, ohne Machbarkeit zu garantieren.",
    "El flotador acciona un contacto mediante un imán. Indique dónde se prohíbe el campo: Standex puede estudiar un imán y sensor remotos, un soporte o enlace mecánico, sin garantizar viabilidad.",
    "Поплавок приводит контакт в действие магнитом. Уточните, где запрещено поле: Standex может изучить вынос магнита и датчика, опору или механическую связь, без гарантии реализуемости.",
    "Il galleggiante aziona un contatto tramite un magnete. Precisare dove è vietato il campo: Standex può studiare magnete e sensore remoti, un supporto o un rinvio meccanico, senza garantirne la fattibilità.",
    "フロートは磁石で接点を作動させます。磁場が禁止される場所を明確にしてください。Standexで磁石とセンサーの遠隔配置、支持具や機械的連結を検討できますが、実現性は未確認です。"],
  movement:[
    "This architecture uses a moving float. If movement is forbidden in the liquid, Standex can study a remote chamber or another location. No float solution is validated as it stands.",
    "此结构使用可移动浮子。如果液体中禁止运动，Standex可研究远置腔室或其他位置。目前尚未验证任何浮子方案。",
    "Diese Architektur verwendet einen beweglichen Schwimmer. Ist Bewegung in der Flüssigkeit verboten, kann Standex eine externe Kammer oder andere Position prüfen. Eine Schwimmerlösung ist derzeit nicht bestätigt.",
    "Esta arquitectura usa un flotador móvil. Si se prohíbe el movimiento en el líquido, Standex puede estudiar una cámara remota u otra ubicación. Ninguna solución está validada en estas condiciones.",
    "Эта конструкция использует подвижный поплавок. Если движение в жидкости запрещено, Standex может изучить выносную камеру или другое размещение. Поплавковое решение пока не подтверждено.",
    "Questa architettura usa un galleggiante mobile. Se il movimento nel liquido è vietato, Standex può studiare una camera remota o altra posizione. Nessuna soluzione a galleggiante è ancora validata.",
    "この構成は可動フロートを使用します。液中の動きが禁止される場合、Standexで外部チャンバーや別配置を検討できます。現状ではフロート方式は検証済みではありません。"],
  accessClosed:[
    "An internal float needs access to the liquid. Without drilling or internal access, let us study an existing indicator, an external chamber or another location with Standex.",
    "内部浮子需要接触液体。如果无法钻孔或进入内部，可与Standex研究现有指示器、外部腔室或其他位置。",
    "Ein interner Schwimmer benötigt Zugang zur Flüssigkeit. Ohne Bohrung oder Innenzugang prüfen wir mit Standex eine vorhandene Anzeige, eine externe Kammer oder eine andere Position.",
    "Un flotador interno necesita acceso al líquido. Sin perforación ni acceso interior, estudiemos con Standex un indicador existente, una cámara externa u otra ubicación.",
    "Внутреннему поплавку нужен доступ к жидкости. Без сверления и доступа внутрь изучим со Standex существующий индикатор, внешнюю камеру или другое размещение.",
    "Un galleggiante interno richiede accesso al liquido. Senza fori o accesso interno, studiamo con Standex un indicatore esistente, una camera esterna o altra posizione.",
    "内部フロートには液体へのアクセスが必要です。穴あけや内部アクセスができない場合、既存の表示器、外部チャンバー、別配置をStandexと検討しましょう。"],
  certification:[
    "ATEX, SIL or OSSD requirements need a study of the construction and complete system. This illustration guarantees no certification or safety function.",
    "ATEX、SIL或OSSD要求需要研究结构及完整系统。本示意图不保证任何认证或安全功能。",
    "ATEX-, SIL- oder OSSD-Anforderungen erfordern eine Prüfung der Konstruktion und des Gesamtsystems. Die Darstellung garantiert keine Zertifizierung oder Sicherheitsfunktion.",
    "Los requisitos ATEX, SIL u OSSD exigen estudiar la construcción y el sistema completo. Esta ilustración no garantiza certificación ni función de seguridad.",
    "Требования ATEX, SIL или OSSD требуют изучения конструкции и всей системы. Иллюстрация не гарантирует сертификацию или функцию безопасности.",
    "I requisiti ATEX, SIL o OSSD richiedono lo studio della costruzione e dell’intero sistema. L’illustrazione non garantisce certificazioni o funzioni di sicurezza.",
    "ATEX、SIL、OSSD要件は構造とシステム全体の検討が必要です。この図は認証や安全機能を保証しません。"],
  hygiene:[
    "Food contact and cleaning: specify materials, seals, cleaning agents, temperatures and CIP/SIP cycles. Hygienic compliance must be validated by Standex.",
    "食品接触与清洗：请明确材料、密封、清洗剂、温度及CIP/SIP周期。卫生合规性须由Standex验证。",
    "Lebensmittelkontakt und Reinigung: Materialien, Dichtungen, Reinigungsmittel, Temperaturen und CIP/SIP-Zyklen angeben. Die hygienische Konformität muss Standex bestätigen.",
    "Contacto alimentario y limpieza: detalle materiales, juntas, agentes, temperaturas y ciclos CIP/SIP. Standex debe validar la conformidad higiénica.",
    "Контакт с пищей и очистка: укажите материалы, уплотнения, средства, температуры и циклы CIP/SIP. Гигиеническое соответствие должен подтвердить Standex.",
    "Contatto alimentare e pulizia: precisare materiali, guarnizioni, agenti, temperature e cicli CIP/SIP. La conformità igienica deve essere validata da Standex.",
    "食品接触と洗浄について、材料、シール、洗浄剤、温度、CIP/SIPサイクルを明記してください。衛生適合性はStandexによる検証が必要です。"],
  viscosity:[
    "Specify viscosity and density at operating temperatures, deposits and sticking risk. Buoyancy and float movement must be checked with Standex.",
    "请明确工作温度下的黏度、密度、沉积物及粘连风险。须与Standex验证浮力和浮子运动。",
    "Viskosität und Dichte bei Betriebstemperaturen, Ablagerungen und Verklebungsrisiko angeben. Auftrieb und Schwimmerbewegung müssen mit Standex geprüft werden.",
    "Indique viscosidad y densidad a las temperaturas de uso, depósitos y riesgo de adherencia. Standex debe verificar flotabilidad y movimiento.",
    "Укажите вязкость и плотность при рабочих температурах, отложения и риск залипания. Плавучесть и движение поплавка нужно проверить со Standex.",
    "Precisare viscosità e densità alle temperature d’uso, depositi e rischio di incollaggio. Galleggiabilità e movimento vanno verificati con Standex.",
    "使用温度での粘度と密度、堆積物、固着のリスクを明記してください。浮力とフロートの動作はStandexとの確認が必要です。"],
  freezing:[
    "Confirm the medium stays liquid at the stated temperatures: freezing, heating, pressure or additives may change the conditions. A float immobilized by ice can no longer detect the level.",
    "请确认介质在声明的温度下保持液态：冻结、加热、压力或添加剂可能改变条件。被冰固定的浮子无法检测液位。",
    "Bestätigen Sie, dass das Medium bei den angegebenen Temperaturen flüssig bleibt: Frost, Heizung, Druck oder Zusätze können die Bedingungen ändern. Ein eingefrorener Schwimmer erkennt keinen Füllstand.",
    "Confirme que el medio permanece líquido a las temperaturas indicadas: congelación, calefacción, presión o aditivos cambian las condiciones. Un flotador inmovilizado por hielo no detecta el nivel.",
    "Подтвердите, что среда остаётся жидкой при указанных температурах: замерзание, нагрев, давление или добавки меняют условия. Замёрзший поплавок не обнаруживает уровень.",
    "Confermare che il mezzo resti liquido alle temperature indicate: gelo, riscaldamento, pressione o additivi possono cambiare le condizioni. Un galleggiante bloccato dal ghiaccio non rileva il livello.",
    "指定温度で媒体が液体のままか確認してください。凍結、加熱、圧力、添加剤で条件が変わります。氷で固定されたフロートは液位を検出できません。"],
  load:[
    "The contact must provide a control signal. Separate motor power using a relay, contactor or interface rated for voltage, current and transients; Standex must validate the circuit.",
    "触点应提供控制信号。请使用适合电压、电流和瞬态的继电器、接触器或接口隔离电机功率；电路须由Standex验证。",
    "Der Kontakt muss ein Steuersignal liefern. Motorleistung über ein für Spannung, Strom und Transienten geeignetes Relais, Schütz oder Interface trennen; Standex muss den Schaltkreis prüfen.",
    "El contacto debe dar una señal de mando. Separe la potencia del motor con un relé, contactor o interfaz adecuados para tensión, corriente y transitorios; Standex debe validar el circuito.",
    "Контакт должен выдавать управляющий сигнал. Отделите питание двигателя реле, контактором или интерфейсом, рассчитанным на напряжение, ток и переходные процессы; Standex должен проверить цепь.",
    "Il contatto deve fornire un segnale di comando. Separare la potenza del motore con relè, contattore o interfaccia adatti a tensione, corrente e transitori; Standex deve validare il circuito.",
    "接点は制御信号を出力する用途に使用してください。電圧、電流、過渡現象に適したリレー、接触器、インターフェースでモーター電力を分離し、Standexで回路を検証してください。"],
  precision:[
    "Specify the required accuracy, resolution and electrical output. The drawing guarantees neither 0.01 mm nor a 4–20 mA output; the measurement chain must be studied with Standex.",
    "请明确所需精度、分辨率和电气输出。图示不保证0.01毫米精度或4–20毫安输出；须与Standex研究测量链。",
    "Erforderliche Genauigkeit, Auflösung und elektrischen Ausgang angeben. Die Zeichnung garantiert weder 0,01 mm noch 4–20 mA; die Messkette muss mit Standex untersucht werden.",
    "Indique precisión, resolución y salida eléctrica requeridas. El dibujo no garantiza 0,01 mm ni una salida 4–20 mA; estudie la cadena de medida con Standex.",
    "Укажите требуемые точность, разрешение и электрический выход. Чертёж не гарантирует 0,01 мм или выход 4–20 мА; измерительную цепь нужно изучить со Standex.",
    "Precisare accuratezza, risoluzione e uscita elettrica richieste. Il disegno non garantisce 0,01 mm né un’uscita 4–20 mA; la catena di misura va studiata con Standex.",
    "必要な精度、分解能、電気出力を明記してください。図は0.01 mm精度や4–20 mA出力を保証しません。測定系はStandexとの検討が必要です。"],
};
const path = new URL("../src/lib/i18n/messages.json",import.meta.url);
const original = await Bun.file(path).text();
const existing = JSON.parse(original);
const entries = Object.entries(LEVEL_REQUIREMENT_MESSAGES).filter(([,message]) => !existing[message]).map(([key,message]) => `${JSON.stringify(message)}: ${JSON.stringify(translations[key as keyof typeof translations])}`);
if(!existing["Réglages"])entries.push(`${JSON.stringify("Réglages")}: ${JSON.stringify(["Settings","设置","Einstellen","Ajustes","Настройки","Opzioni","設定"])}`);
const bookingMessage="Le calendrier n’est pas encore connecté. Votre interlocuteur Standex vous contactera pour convenir d’un rendez-vous.";
if(!existing[bookingMessage]) entries.push(`${JSON.stringify(bookingMessage)}: ${JSON.stringify([
  "The calendar is not connected yet. Your Standex representative will contact you to arrange a meeting.",
  "日历尚未连接。您的Standex联系人将与您联系以安排会议。",
  "Der Kalender ist noch nicht verbunden. Ihr Standex-Ansprechpartner wird Sie zur Terminvereinbarung kontaktieren.",
  "El calendario aún no está conectado. Su representante de Standex le contactará para concertar una reunión.",
  "Календарь ещё не подключён. Ваш представитель Standex свяжется с вами для согласования встречи.",
  "Il calendario non è ancora collegato. Il referente Standex la contatterà per concordare un appuntamento.",
  "カレンダーはまだ接続されていません。Standex担当者が日程調整のためご連絡します。"
])}`);
if (!existing["Modifier le besoin"]) entries.push(`${JSON.stringify("Modifier le besoin")}: ${JSON.stringify(["Edit the need","修改需求","Bedarf bearbeiten","Editar la necesidad","Изменить задачу","Modificare il bisogno","要件を編集"])}`);
if (entries.length) await Bun.write(path, original.replace(/^\{/, "{\n  " + entries.join(",\n  ") + ","));
