from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
OUT_PATH = OUT_DIR / "벨로르_고가상품_판매_확약서.pdf"
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

NAVY = colors.HexColor("#172A46")
BLUE = colors.HexColor("#2E74B5")
MUTED = colors.HexColor("#626973")
LIGHT = colors.HexColor("#F2F4F7")
INK = colors.HexColor("#1A1A1A")


def register_fonts():
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Malgun-Bold", str(FONT_BOLD)))


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFont("Malgun-Bold", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(inch, height - 0.52 * inch, "BELLORE  |  PG·카드사 심사 제출용")
    canvas.setStrokeColor(colors.HexColor("#D7DBE2"))
    canvas.setLineWidth(0.5)
    canvas.line(inch, height - 0.61 * inch, width - inch, height - 0.61 * inch)
    canvas.setFont("Malgun", 8)
    canvas.drawCentredString(
        width / 2,
        0.46 * inch,
        f"벨로르  |  bellore.co.kr  |  010-6293-6668  |  {doc.page}",
    )
    canvas.restoreState()


def build():
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUT_PATH),
        pagesize=letter,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=0.84 * inch,
        bottomMargin=0.72 * inch,
        title="벨로르 500만원 이상 고가상품 판매 확약서",
        author="벨로르",
        subject="PG사 및 카드사 입점 심사 제출용",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="pledge",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    doc.addPageTemplates(PageTemplate(id="pledge", frames=[frame], onPage=header_footer))

    styles = getSampleStyleSheet()
    kicker = ParagraphStyle(
        "Kicker",
        parent=styles["Normal"],
        fontName="Malgun-Bold",
        fontSize=9.5,
        leading=12,
        textColor=BLUE,
        spaceBefore=8,
        spaceAfter=3,
        wordWrap="CJK",
    )
    title = ParagraphStyle(
        "PledgeTitle",
        parent=styles["Title"],
        fontName="Malgun-Bold",
        fontSize=21,
        leading=27,
        textColor=NAVY,
        alignment=TA_LEFT,
        spaceBefore=0,
        spaceAfter=4,
        wordWrap="CJK",
    )
    subtitle = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontName="Malgun-Bold",
        fontSize=9.8,
        leading=14,
        textColor=MUTED,
        spaceAfter=10,
        wordWrap="CJK",
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Malgun",
        fontSize=9.5,
        leading=14,
        textColor=INK,
        spaceAfter=5,
        wordWrap="CJK",
    )
    lead = ParagraphStyle(
        "Lead",
        parent=body,
        fontName="Malgun-Bold",
        fontSize=9.8,
        leading=14.5,
        spaceAfter=9,
    )
    section = ParagraphStyle(
        "Section",
        parent=styles["Heading1"],
        fontName="Malgun-Bold",
        fontSize=13,
        leading=17,
        textColor=BLUE,
        spaceBefore=12,
        spaceAfter=7,
        wordWrap="CJK",
    )
    clause = ParagraphStyle(
        "Clause",
        parent=body,
        fontSize=9.2,
        leading=13.2,
        spaceAfter=4.5,
    )
    table_label = ParagraphStyle(
        "TableLabel",
        parent=body,
        fontName="Malgun-Bold",
        fontSize=9,
        leading=12,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=0,
    )
    table_value = ParagraphStyle(
        "TableValue",
        parent=body,
        fontSize=9,
        leading=12,
        spaceAfter=0,
    )
    table_note = ParagraphStyle(
        "TableNote",
        parent=body,
        fontSize=8.5,
        leading=11,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=0,
    )

    story = [
        Paragraph("확약서", kicker),
        Paragraph("500만원 이상 고가상품 판매 확약서", title),
        Paragraph("수신: 포트원 및 카드사·PG사 입점심사 담당자 귀중", subtitle),
        Paragraph(
            "당사는 500만원 이상 고가 명품시계를 판매하는 가맹점으로서 건전한 카드거래와 "
            "소비자 보호를 위하여 아래 사항을 확인하고 이를 성실히 준수할 것을 확약합니다.",
            lead,
        ),
    ]

    metadata_rows = [
        [Paragraph("상호", table_label), Paragraph("벨로르", table_value)],
        [Paragraph("대표자", table_label), Paragraph("정성호", table_value)],
        [Paragraph("사업자등록번호", table_label), Paragraph("707-69-00729", table_value)],
        [
            Paragraph("사업장 주소", table_label),
            Paragraph("서울특별시 중구 다산로 258 벨로르", table_value),
        ],
        [
            Paragraph("쇼핑몰 / 연락처", table_label),
            Paragraph("https://bellore.co.kr  /  010-6293-6668", table_value),
        ],
    ]
    metadata = Table(metadata_rows, colWidths=[1.7 * inch, 4.8 * inch], hAlign="LEFT")
    metadata.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#C9CED6")),
                ("BACKGROUND", (0, 0), (0, -1), LIGHT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend([metadata, Paragraph("확약 내용", section)])

    clauses = (
        (
            "제1조",
            "실물 명품시계의 정상적인 통신판매 거래에 대해서만 결제를 받으며, 현금융통·카드깡·"
            "본인 미사용 거래·상품권 및 가상자산 구입 등 변칙적인 자금융통 목적의 거래를 하지 않습니다.",
        ),
        (
            "제2조",
            "구매자 본인 명의 또는 적법한 사용 승낙을 받은 결제수단만 사용하도록 하며, 타인의 카드·"
            "계정·개인정보를 도용한 결제를 허용하지 않습니다.",
        ),
        (
            "제3조",
            "위조 상품, 허위 상품, 실제 판매가와 현저히 다른 가격의 상품 또는 배송 의사가 없는 상품을 "
            "판매하거나 결제하지 않습니다.",
        ),
        (
            "제4조",
            "고가 주문은 구매자 정보, 연락처, 거래 의사와 부정거래 징후를 확인하고, 의심 거래는 결제 확정과 "
            "출고를 보류하거나 취소합니다.",
        ),
        (
            "제5조",
            "현금융통, 명의도용, 부정거래 등 이상 거래가 확인되면 상품과 거래를 즉시 중단하고 결제 취소·환불을 "
            "처리하며, 카드사·PG사·포트원 및 관계기관의 확인 절차에 적극 협조합니다.",
        ),
        (
            "제6조",
            "bellore.co.kr에서 체결되는 모든 구매계약의 판매 당사자는 벨로르입니다. 벨로르는 상품정보 제공, "
            "주문확인, 결제, 검수, 배송, 청약철회, 교환·환불, 고객상담 및 거래분쟁 해결에 관한 책임을 부담합니다.",
        ),
        (
            "제7조",
            "상품 공급협력사는 구매자에 대한 판매자가 아니며, 공급 상품으로 인한 민원·손해·분쟁도 벨로르가 "
            "직접 접수하고 해결합니다.",
        ),
        (
            "제8조",
            "카드사·PG사·포트원의 운영정책과 관계 법령을 준수하고, 거래증빙·본인확인·배송증빙·정품 검수 기록을 "
            "보관하며 요청 시 제출합니다.",
        ),
        (
            "제9조",
            "위 확약을 위반하여 발생하는 결제 취소, 환불, 민원, 손해, 제재 및 계약 해지에 관한 책임을 부담하며, "
            "해당 이슈 발생 시 하위몰 또는 관련 서비스의 즉시 해지·중단 조치에 이의 없이 협조합니다.",
        ),
    )
    for label, text in clauses:
        story.append(Paragraph(f"<b>{label}</b>&nbsp;&nbsp;{text}", clause))

    acknowledgment = Paragraph(
        "<b>본 확약서의 내용을 충분히 확인하였으며, 상기 사항을 성실히 준수할 것을 확약합니다.</b>",
        lead,
    )
    signature_rows = [
        [Paragraph("작성일", table_label), Paragraph("2026년 07월 23일", table_value)],
        [Paragraph("상호", table_label), Paragraph("벨로르", table_value)],
        [Paragraph("대표자", table_label), Paragraph("정성호  (서명 또는 인감)", table_value)],
        [
            Paragraph("인감 날인란", table_label),
            Paragraph("법인인감 또는 개인인감을 이 칸에 날인해 주세요.", table_note),
        ],
    ]
    signature = Table(
        signature_rows,
        colWidths=[1.7 * inch, 4.8 * inch],
        rowHeights=[None, None, None, 0.7 * inch],
        hAlign="LEFT",
    )
    signature.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#C9CED6")),
                ("BACKGROUND", (0, 0), (0, -1), LIGHT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend([Spacer(1, 4), KeepTogether([acknowledgment, signature])])
    doc.build(story)
    print(OUT_PATH)


if __name__ == "__main__":
    build()
