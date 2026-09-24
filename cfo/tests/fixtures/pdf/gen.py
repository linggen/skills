"""Synthetic bank-statement PDFs for the CFO parser end-to-end test.

Every name, number and amount here is invented. Each PDF is written beside a
`<name>.truth.json` holding the rows a correct parser must produce, in
statement order: {date, merchant (a substring the merchant must contain),
amount (signed: money in +, money out -), transfer (the ledger should
exclude it from spend/income)}.
"""
import json
import sys
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT.mkdir(parents=True, exist_ok=True)
W, H = letter


def money(v):
    return f'{abs(v):,.2f}'


def write(name, draw, truth):
    c = canvas.Canvas(str(OUT / f'{name}.pdf'), pagesize=letter)
    c.setTitle(name)
    draw(c)
    c.save()
    (OUT / f'{name}.truth.json').write_text(json.dumps(truth, indent=1, ensure_ascii=False))


# ── 1. BMO chequing, "Everyday Banking" layout ─────────────────────────────
# Columns: Date | Description | Amounts deducted from your account ($) |
# Amounts added to your account ($) | Balance ($). The header wraps over two
# lines, the date is printed on every row ("Jul 08"), amounts are
# right-aligned in their column, and every row carries the running balance.
# Two pages, the header repeated on page 2.
def bmo_chequing():
    rows = [  # (date, description, signed amount, transfer)
        ('Jul 08', 'Direct Deposit, NORTHWIND PAYROLL/PAY', 3100.00, False),
        ('Jul 09', 'INTERAC e-Transfer Sent', -250.00, False),
        ('Jul 10', 'INTERAC e-Transfer Received', 120.00, False),
        ('Jul 11', 'Online Bill Payment, ROGERS BK MC', -600.00, True),
        ('Jul 12', 'Online Bill Payment, BRIGHTWATER ACADEMY', -1450.00, False),
        ('Jul 15', 'Pre-Authorized Payment, EASTCOAST LIFE INS', -89.40, False),
        ('Jul 16', 'Online Transfer, TF 1234-567', -500.00, True),
        ('Jul 18', 'Online Transfer, TF 7654-321', 300.00, True),
        ('Jul 20', 'Online Bill Payment, PC MC', -412.33, True),
        ('Jul 22', 'Direct Deposit, NORTHWIND PAYROLL/PAY', 3100.00, False),
        ('Jul 24', 'Online Bill Payment, AMEX CARDS', -900.00, True),
        ('Jul 28', 'Debit Card Purchase, CORNER GROCER', -64.18, False),
        ('Jul 30', 'Premium Plan Fee', -30.95, False),
        ('Jul 30', 'Plan fee rebate', 30.95, False),
        ('Aug 02', 'INTERAC e-Transfer Sent', -75.00, False),
        ('Aug 04', 'ATM Withdrawal', -100.00, False),
        ('Aug 04', 'Online Bill Payment, BMO MASTERCARD', -1234.56, True),
    ]
    opening = 2450.00
    x_date, x_desc, x_ded, x_add, x_bal = 50, 100, 395, 480, 560  # right edges for amounts

    def header(c, y):
        c.setFont('Helvetica-Bold', 8)
        c.drawString(x_date, y, 'Date')
        c.drawString(x_desc, y, 'Description')
        c.drawRightString(x_ded, y, 'Amounts deducted from')
        c.drawRightString(x_add, y, 'Amounts added to')
        c.drawRightString(x_bal, y, 'Balance ($)')
        c.drawRightString(x_ded, y - 10, 'your account ($)')
        c.drawRightString(x_add, y - 10, 'your account ($)')
        return y - 26

    def top(c, page):
        c.setFont('Helvetica-Bold', 12)
        c.drawString(50, H - 50, 'BMO Bank of Montreal')
        c.setFont('Helvetica', 9)
        c.drawString(50, H - 64, 'Everyday Banking statement')
        c.drawString(50, H - 76, 'For the period ending August 5, 2026')
        c.drawString(50, H - 88, 'Primary Chequing Account # 1234 5678-901')
        c.drawRightString(560, H - 50, f'Page {page} of 2')
        return header(c, H - 120)

    def draw(c):
        bal = opening
        y = top(c, 1)
        c.setFont('Helvetica', 8)
        c.drawString(x_date, y, 'Jul 07')
        c.drawString(x_desc, y, 'Opening balance')
        c.drawRightString(x_bal, y, money(bal))
        y -= 14
        ded_total = add_total = 0.0
        for i, (d, desc, amt, _) in enumerate(rows):
            if i == 10:  # page break, header again
                c.showPage()
                y = top(c, 2)
                c.setFont('Helvetica', 8)
            bal = round(bal + amt, 2)
            c.drawString(x_date, y, d)
            c.drawString(x_desc, y, desc)
            if amt < 0:
                c.drawRightString(x_ded, y, money(amt))
                ded_total += -amt
            else:
                c.drawRightString(x_add, y, money(amt))
                add_total += amt
            c.drawRightString(x_bal, y, money(bal))
            y -= 14
        c.setFont('Helvetica-Bold', 8)
        c.drawString(x_date, y, 'Aug 05')
        c.drawString(x_desc, y, 'Closing totals')
        c.drawRightString(x_ded, y, money(ded_total))
        c.drawRightString(x_add, y, money(add_total))
        c.drawRightString(x_bal, y, money(bal))

    months = {'Jul': '07', 'Aug': '08'}
    truth = [{'date': f"2026-{months[d[:3]]}-{d[4:]}", 'merchant': desc.split(', ')[-1] if ', ' in desc else desc,
              'amount': amt, 'transfer': tr} for d, desc, amt, tr in rows]
    write('bmo-chequing', draw, {'account_type': 'checking', 'rows': truth,
                                 'opening': opening, 'closing': round(opening + sum(r[2] for r in rows), 2)})


# ── 2. BMO Mastercard ──────────────────────────────────────────────────────
# A summary box above the transactions, then TRANS DATE | POSTING DATE |
# DESCRIPTION | REFERENCE NO. | AMOUNT ($). Dates print "Aug. 4". A credit
# prints with a trailing "CR"; the automatic payment prints with a minus.
def bmo_mastercard():
    rows = [  # (trans, posting, description, ref, printed amount, signed, transfer)
        ('Aug. 4', 'Aug. 5', 'NEW HARBOUR MARKET HALIFAX NS', '55134421234567890100001', '93.87', -93.87, False),
        ('Aug. 5', 'Aug. 5', 'AUTOMATIC PYMT RECEIVED', '55134421234567890100008', '-1,234.56', 1234.56, True),
        ('Aug. 6', 'Aug. 7', 'PUBLIC MOBILE SELF-SERVE', '55134421234567890100002', '14.56', -14.56, False),
        ('Aug. 9', 'Aug. 10', 'MAPLE LEAF CINEMAS', '55134421234567890100003', '38.40', -38.40, False),
        ('Aug. 9', 'Aug. 10', 'MAPLE LEAF CINEMAS', '55134421234567890100004', '38.40', -38.40, False),  # genuine duplicate
        ('Aug. 12', 'Aug. 13', 'SEABREEZE OUTFITTERS', '55134421234567890100005', '120.00', -120.00, False),
        ('Aug. 14', 'Aug. 15', 'SEABREEZE OUTFITTERS', '55134421234567890100006', '22.50 CR', 22.50, False),  # refund
        ('Aug. 21', 'Aug. 24', 'HARBOURSIDE PARKING', '55134421234567890100007', '2.50', -2.50, False),
        ('Aug. 28', 'Aug. 31', 'SUGAR & SPICE BAKERY', '55134421234567890100009', '15.91', -15.91, False),
        ('Sep. 1', 'Sep. 2', 'ATLANTIC HOME INSURANCE', '55134421234567890100010', '391.99', -391.99, False),
    ]

    def draw(c):
        c.setFont('Helvetica-Bold', 12)
        c.drawString(50, H - 50, 'BMO Mastercard')
        c.setFont('Helvetica', 9)
        c.drawString(50, H - 64, 'Statement date Sep. 4, 2026')
        c.drawString(50, H - 76, 'Card number 5191 **** **** 4421')
        # summary box
        c.rect(50, H - 190, 250, 100)
        box = [('Previous total balance', '$1,234.56'), ('Payments and credits', '-$1,257.06'),
               ('New charges', '$715.63'), ('New balance', '$693.13'),
               ('Minimum payment', '$10.00'), ('Payment due date', 'Sep. 29, 2026'),
               ('Credit limit', '$5,000.00')]
        y = H - 102
        for k, v in box:
            c.drawString(58, y, k)
            c.drawRightString(292, y, v)
            y -= 13
        y = H - 220
        c.setFont('Helvetica-Bold', 8)
        for x, label in ((50, 'TRANS DATE'), (110, 'POSTING DATE'), (180, 'DESCRIPTION'), (400, 'REFERENCE NO.')):
            c.drawString(x, y, label)
        c.drawRightString(560, y, 'AMOUNT ($)')
        y -= 16
        c.setFont('Helvetica', 8)
        for t, p, desc, ref, printed, _, _ in rows:
            c.drawString(50, y, t)
            c.drawString(110, y, p)
            c.drawString(180, y, desc)
            c.drawString(400, y, ref)
            c.drawRightString(560, y, printed)
            y -= 14
        y -= 6
        c.setFont('Helvetica-Bold', 8)
        c.drawString(180, y, 'Total for card number 5191 **** **** 4421')
        c.drawRightString(560, y, '693.13')

    mon = {'Aug': '08', 'Sep': '09'}
    truth = []
    for t, _, desc, _, _, signed, tr in rows:
        m, d = t.replace('.', '').split()
        truth.append({'date': f'2026-{mon[m]}-{int(d):02d}', 'merchant': desc.replace(' HALIFAX NS', ''),
                      'amount': signed, 'transfer': tr})
    write('bmo-mastercard', draw, {'account_type': 'credit', 'rows': truth})


# ── 3. RBC-like chequing: Withdrawals | Deposits, date printed once a day ──
# RBC prints the date only on the first row of each day ("07 Dec"), and the
# statement crosses the year: Dec 2025 → Jan 2026.
def rbc_chequing():
    days = [  # (date or '', description, signed, transfer)
        ('18 Dec', 'Payroll Deposit NORTHWIND', 2800.00, False),
        ('', 'e-Transfer sent J SMITH', -60.00, False),
        ('22 Dec', 'Contactless Interac purchase - 1234 HOLLY GROCERS', -142.37, False),
        ('', 'Contactless Interac purchase - 5678 CEDAR PHARMACY', -23.10, False),
        ('', 'Online Banking payment - 9911 VISA RBC', -800.00, True),
        ('29 Dec', 'Monthly fee', -4.00, False),
        ('02 Jan', 'Payroll Deposit NORTHWIND', 2800.00, False),
        ('', 'Online Banking transfer - 4421 to savings', -1000.00, True),
        ('08 Jan', 'Utility bill pmt NS POWER', -176.52, False),
        ('', 'e-Transfer - Autodeposit A NGUYEN', 45.00, False),
    ]
    x_date, x_desc, x_wd, x_dep, x_bal = 50, 100, 420, 490, 560
    opening = 3120.44

    def draw(c):
        c.setFont('Helvetica-Bold', 12)
        c.drawString(50, H - 50, 'Your RBC personal banking account statement')
        c.setFont('Helvetica', 9)
        c.drawString(50, H - 64, 'From December 15, 2025 to January 14, 2026')
        c.drawString(50, H - 76, 'RBC Day to Day Banking 01234-5678901')
        y = H - 110
        c.setFont('Helvetica-Bold', 8)
        c.drawString(x_date, y, 'Date')
        c.drawString(x_desc, y, 'Description')
        c.drawRightString(x_wd, y, 'Withdrawals ($)')
        c.drawRightString(x_dep, y, 'Deposits ($)')
        c.drawRightString(x_bal, y, 'Balance ($)')
        y -= 16
        c.setFont('Helvetica', 8)
        c.drawString(x_date, y, '15 Dec')
        c.drawString(x_desc, y, 'Opening Balance')
        c.drawRightString(x_bal, y, money(opening))
        y -= 14
        bal = opening
        for i, (d, desc, amt, _) in enumerate(days):
            bal = round(bal + amt, 2)
            if d:
                c.drawString(x_date, y, d)
            c.drawString(x_desc, y, desc)
            c.drawRightString(x_wd if amt < 0 else x_dep, y, money(amt))
            last_of_day = i + 1 == len(days) or days[i + 1][0]
            if last_of_day:  # RBC prints the balance once per day
                c.drawRightString(x_bal, y, money(bal))
            y -= 14
        c.drawString(x_date, y, '14 Jan')
        c.drawString(x_desc, y, 'Closing Balance')
        c.drawRightString(x_bal, y, money(bal))

    mon = {'Dec': ('2025', '12'), 'Jan': ('2026', '01')}
    truth, cur = [], None
    for d, desc, amt, tr in days:
        if d:
            y, m = mon[d[3:]]
            cur = f'{y}-{m}-{d[:2]}'
        core = desc.split(' - ')[-1] if ' - ' in desc else desc
        truth.append({'date': cur, 'merchant': core.split(' ', 1)[-1] if core[:4].isdigit() else core,
                      'amount': amt, 'transfer': tr})
    write('rbc-chequing', draw, {'account_type': 'checking', 'rows': truth})


# ── 4. Generic Canadian Visa, Dec→Jan, amounts with $ and trailing minus ──
def generic_visa():
    rows = [
        ('Dec 16', 'Dec 17', 'NORTHERN BOOKS TORONTO ON', '$45.20', -45.20, False),
        ('Dec 20', 'Dec 21', 'SNOWLINE SPORTS', '$310.00', -310.00, False),
        ('Dec 27', 'Dec 28', 'SNOWLINE SPORTS RETURN', '$60.00-', 60.00, False),
        ('Jan 02', 'Jan 02', 'PAYMENT - THANK YOU', '$400.00-', 400.00, True),
        ('Jan 05', 'Jan 06', 'FOGHORN COFFEE CO', '$6.75', -6.75, False),
        ('Jan 11', 'Jan 12', 'INTEREST CHARGES', '$12.34', -12.34, False),
    ]

    def draw(c):
        c.setFont('Helvetica-Bold', 12)
        c.drawString(50, H - 50, 'Maritime Rewards Visa')
        c.setFont('Helvetica', 9)
        c.drawString(50, H - 64, 'Statement period Dec 15, 2025 - Jan 14, 2026')
        c.drawString(50, H - 76, 'Credit limit $3,000.00   Minimum payment $25.00   Payment due date Feb 8, 2026')
        y = H - 110
        c.setFont('Helvetica-Bold', 8)
        for x, l in ((50, 'Transaction'), (110, 'Posting'), (170, 'Description')):
            c.drawString(x, y, l)
        c.drawRightString(560, y, 'Amount')
        y -= 16
        c.setFont('Helvetica', 8)
        for t, p, desc, printed, _, _ in rows:
            c.drawString(50, y, t)
            c.drawString(110, y, p)
            c.drawString(170, y, desc)
            c.drawRightString(560, y, printed)
            y -= 14
        c.drawString(170, y - 6, 'Total new balance')
        c.drawRightString(560, y - 6, '$224.49')

    mon = {'Dec': ('2025', '12'), 'Jan': ('2026', '01')}
    truth = []
    for t, _, desc, _, signed, tr in rows:
        y, m = mon[t[:3]]
        truth.append({'date': f'{y}-{m}-{t[4:]}', 'merchant': desc.replace(' TORONTO ON', ''),
                      'amount': signed, 'transfer': tr})
    write('generic-visa', draw, {'account_type': 'credit', 'rows': truth})


bmo_chequing()
bmo_mastercard()
rbc_chequing()
generic_visa()
print('wrote', sorted(p.name for p in OUT.iterdir()))
