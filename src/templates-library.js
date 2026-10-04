/*
 * Built-in sample documents. Shared by the server (PDF generation) and the browser prototype.
 * Text supports {{variable}} placeholders filled in when a template is used.
 * Paragraph markers: "# " heading, "- " bullet, "kv:Label|Value" two-column row, "sig:" text block before signatures.
 * Samples are starting points, not legal advice: have them reviewed for your jurisdiction.
 */
(function (root) {
  const CO = ['company_name', 'Company name', 'Acme Studio Pvt. Ltd.'];
  const DATE = ['letter_date', 'Letter date', '02 Oct 2026'];
  const CITY = ['city', 'City (governing courts)', 'Hyderabad'];

  const LIBRARY = [
    // ---------------------------------------------------------------- Legal
    {
      key: 'nda_mutual', name: 'Mutual Non-Disclosure Agreement', category: 'Legal', ccat: 'nda',
      description: 'Two-way NDA for sharing confidential information while exploring a business relationship.',
      message: 'Please review and sign the attached mutual NDA.',
      title: 'Mutual Non-Disclosure Agreement', subtitle: 'Between {{party_a}} and {{party_b}}',
      vars: [['party_a', 'First party (company)', 'Acme Studio Pvt. Ltd.'], ['party_b', 'Second party (company)', 'Northwind Traders LLP'], ['purpose', 'Purpose of disclosure', 'evaluating a joint product partnership'], ['term_years', 'Term (years)', '2'], CITY],
      roles: [['First party', 'Designation'], ['Second party', 'Designation']],
      paras: [
        'This Mutual Non-Disclosure Agreement (the "Agreement") is made on the date of the last signature below between {{party_a}} and {{party_b}} (each a "Party").',
        '# 1. Purpose', 'The Parties wish to share information for the purpose of {{purpose}} (the "Purpose").',
        '# 2. Confidential Information', '"Confidential Information" means any non-public business, technical, financial or personal information disclosed by one Party to the other, in any form, that is marked confidential or would reasonably be understood to be confidential.',
        '# 3. Obligations', 'Each Party shall:', '- use the other Party\'s Confidential Information only for the Purpose;', '- disclose it only to employees and advisers who need to know it and are bound by similar duties;', '- protect it with at least reasonable care; and', '- return or destroy it on written request.',
        '# 4. Exclusions', 'These obligations do not apply to information that is or becomes public through no fault of the receiving Party, was lawfully known before disclosure, is received from a third party without restriction, or is independently developed.',
        '# 5. Term', 'This Agreement lasts {{term_years}} years from signature. Confidentiality obligations survive for three (3) years after it ends.',
        '# 6. Governing law', 'This Agreement is governed by the laws of India, and the courts at {{city}} have exclusive jurisdiction. It may be executed electronically and in counterparts.',
      ],
    },
    {
      key: 'nda_oneway', name: 'One-way NDA', category: 'Legal', ccat: 'nda',
      description: 'Protects your information when you share it with a vendor, candidate or consultant.',
      message: 'Please sign this confidentiality agreement before we share project details.',
      title: 'Non-Disclosure Agreement', subtitle: 'One-way confidentiality undertaking',
      vars: [CO, ['recipient_name', 'Recipient (person or company)', 'Kiran Das'], ['purpose', 'Purpose', 'reviewing the 2027 product roadmap'], CITY],
      roles: [['Disclosing party', 'Designation'], ['Recipient', 'Company (if any)']],
      paras: [
        '{{company_name}} (the "Company") will share confidential information with {{recipient_name}} (the "Recipient") for the purpose of {{purpose}}.',
        '# 1. Undertaking', 'The Recipient shall keep all information received from the Company strictly confidential, use it only for the stated purpose, and not copy, publish or disclose it to anyone without the Company\'s prior written consent.',
        '# 2. Personal data', 'Any personal data received shall be processed only on the Company\'s instructions and protected in line with applicable data protection law, including the Digital Personal Data Protection Act, 2023 where it applies.',
        '# 3. Return of information', 'On request, or when the purpose ends, the Recipient shall return or securely destroy all confidential information and confirm this in writing.',
        '# 4. Remedies', 'The Recipient acknowledges that a breach may cause irreparable harm and that the Company may seek injunctive relief in addition to any other remedy.',
        '# 5. Term and law', 'These obligations last three (3) years from the date of signature. This undertaking is governed by Indian law, with exclusive jurisdiction of the courts at {{city}}.',
      ],
    },
    {
      key: 'mou', name: 'Memorandum of Understanding', category: 'Legal', ccat: 'commercial',
      description: 'Records the intent and main terms of a collaboration before a definitive agreement.',
      message: 'Please review and sign the MoU.',
      title: 'Memorandum of Understanding', subtitle: '{{party_a}} and {{party_b}}',
      vars: [['party_a', 'First party', 'Acme Studio Pvt. Ltd.'], ['party_b', 'Second party', 'Bluefin Analytics Pvt. Ltd.'], ['objective', 'Objective', 'co-developing an analytics module for retail clients'], ['duration', 'Duration', '12 months']],
      roles: [['First party', 'Designation'], ['Second party', 'Designation']],
      paras: [
        'This Memorandum of Understanding ("MoU") sets out the common understanding between {{party_a}} and {{party_b}}.',
        '# 1. Objective', 'The parties intend to cooperate on {{objective}}.',
        '# 2. Responsibilities', '- {{party_a}} will provide product design and client relationships.', '- {{party_b}} will provide data engineering and analytics expertise.', '- Each party bears its own costs unless agreed otherwise in writing.',
        '# 3. Duration', 'This MoU remains in effect for {{duration}} or until replaced by a definitive agreement.',
        '# 4. Non-binding nature', 'Except for the clauses on confidentiality and governing law, this MoU records intent only and does not create legally binding obligations.',
        '# 5. Confidentiality', 'Each party shall keep confidential any non-public information received from the other in connection with this MoU.',
      ],
    },
    {
      key: 'board_resolution', name: 'Board Resolution', category: 'Corporate', ccat: 'corporate',
      description: 'Certified resolution of the board of directors, signed by the chairperson and a director.',
      message: 'Please sign the board resolution passed at today\'s meeting.',
      title: 'Certified True Copy of Board Resolution', subtitle: '{{company_name}}',
      vars: [CO, ['meeting_date', 'Meeting date', '30 Sep 2026'], ['venue', 'Venue', 'the registered office, Hyderabad'], ['resolution', 'Resolution subject', 'opening a current account with HDFC Bank Ltd.'], ['authorised_person', 'Person authorised', 'Mr. Vamshi Rao, Director']],
      roles: [['Chairperson', 'DIN'], ['Director', 'DIN']],
      paras: [
        'Certified true copy of the resolution passed at the meeting of the Board of Directors of {{company_name}} held on {{meeting_date}} at {{venue}}.',
        '# Resolution', '"RESOLVED THAT the consent of the Board be and is hereby accorded for {{resolution}}.',
        '"RESOLVED FURTHER THAT {{authorised_person}} be and is hereby authorised to sign all documents, make filings and do all acts necessary to give effect to this resolution."',
        'We certify that the above resolution was duly passed, that the required quorum was present, and that the resolution remains in force.',
      ],
    },
    // ---------------------------------------------------------------- HR
    {
      key: 'offer_letter', name: 'Employment Offer Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Job offer with role, CTC, joining date and conditions; signed by HR and accepted by the candidate.',
      message: 'We are delighted to extend this offer. Please review and sign to accept.',
      title: 'Offer of Employment', subtitle: 'Private & confidential',
      vars: [CO, DATE, ['candidate_name', 'Candidate name', 'Priya Sharma'], ['designation', 'Designation', 'Senior Product Designer'], ['department', 'Department', 'Design'], ['ctc', 'Annual CTC', 'INR 18,00,000'], ['joining_date', 'Joining date', '01 Nov 2026'], ['location', 'Work location', 'Hyderabad (hybrid)'], ['manager', 'Reporting manager', 'Rahul Menon, Head of Design']],
      roles: [['For the Company', 'Designation'], ['Accepted by candidate', 'Confirmed joining date']],
      paras: [
        'Dear {{candidate_name}},',
        'We are pleased to offer you the position of {{designation}} in the {{department}} team at {{company_name}}, on the terms below.',
        'kv:Designation|{{designation}}', 'kv:Reporting to|{{manager}}', 'kv:Annual CTC|{{ctc}}', 'kv:Date of joining|{{joining_date}}', 'kv:Location|{{location}}', 'kv:Probation|6 months',
        '# Conditions', 'This offer depends on satisfactory background and reference checks, proof of your educational and employment history, and your right to work in India. A detailed appointment letter will be issued on joining.',
        '# Acceptance', 'Please sign this letter within seven (7) days to accept. If it is not accepted by then, the offer will lapse.',
        'We look forward to welcoming you to {{company_name}}.',
      ],
    },
    {
      key: 'appointment_letter', name: 'Appointment Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Formal terms of employment issued on joining: duties, pay, probation, notice and policies.',
      message: 'Welcome aboard! Please sign your appointment letter.',
      title: 'Letter of Appointment', subtitle: 'Private & confidential',
      vars: [CO, DATE, ['employee_name', 'Employee name', 'Priya Sharma'], ['employee_id', 'Employee ID', 'ACM-0142'], ['designation', 'Designation', 'Senior Product Designer'], ['ctc', 'Annual CTC', 'INR 18,00,000'], ['joining_date', 'Date of joining', '01 Nov 2026'], ['notice', 'Notice period', '60 days']],
      roles: [['For the Company', 'Designation'], ['Employee', 'Employee ID']],
      paras: [
        'Dear {{employee_name}},',
        'Further to your acceptance of our offer, we are pleased to appoint you as {{designation}} (Employee ID {{employee_id}}) with effect from {{joining_date}}.',
        '# 1. Compensation', 'Your annual cost to company is {{ctc}}, with the break-up set out in Annexure A. Salary is paid monthly, subject to applicable tax deductions.',
        '# 2. Probation and confirmation', 'You will be on probation for six (6) months. On satisfactory completion you will be confirmed in writing.',
        '# 3. Working hours and leave', 'You will follow the Company\'s working hours, attendance and leave policies as amended from time to time.',
        '# 4. Confidentiality and IP', 'You will keep Company information confidential and all work product created in the course of employment belongs to the Company.',
        '# 5. Notice period', 'After confirmation, either party may end employment with {{notice}} written notice or salary in lieu of notice. During probation the notice period is 15 days.',
        '# 6. Policies', 'You agree to comply with the Company\'s code of conduct, POSH policy, information security policy and other policies published on the intranet.',
      ],
    },
    {
      key: 'appraisal_letter', name: 'Appraisal Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Annual performance review outcome with rating, revised designation and salary.',
      message: 'Congratulations on your appraisal. Please acknowledge the letter by signing.',
      title: 'Annual Appraisal Letter', subtitle: 'Performance review {{review_period}}',
      vars: [CO, DATE, ['employee_name', 'Employee name', 'Arjun Mehta'], ['employee_id', 'Employee ID', 'ACM-0087'], ['review_period', 'Review period', 'FY 2025-26'], ['rating', 'Performance rating', 'Exceeds expectations (4/5)'], ['current_designation', 'Current designation', 'Software Engineer II'], ['new_designation', 'Revised designation', 'Senior Software Engineer'], ['previous_ctc', 'Previous annual CTC', 'INR 16,00,000'], ['revised_ctc', 'Revised annual CTC', 'INR 19,20,000'], ['increment', 'Increment', '20%'], ['effective_date', 'Effective from', '01 Oct 2026']],
      roles: [['For the Company', 'Designation'], ['Employee acknowledgement', 'Employee ID']],
      paras: [
        'Dear {{employee_name}},',
        'Thank you for your contribution during {{review_period}}. Based on the annual performance review, we are pleased to share the outcome below.',
        'kv:Employee ID|{{employee_id}}', 'kv:Performance rating|{{rating}}', 'kv:Current designation|{{current_designation}}', 'kv:Revised designation|{{new_designation}}', 'kv:Previous annual CTC|{{previous_ctc}}', 'kv:Revised annual CTC|{{revised_ctc}}', 'kv:Increment|{{increment}}', 'kv:Effective from|{{effective_date}}',
        'The revised salary break-up is enclosed. All other terms of your appointment remain unchanged.',
        'This letter and its contents are confidential. We appreciate your work and look forward to your continued growth with us.',
        'Please sign below to acknowledge receipt of this letter.',
      ],
    },
    {
      key: 'promotion_letter', name: 'Promotion Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Confirms a promotion with new title, responsibilities and pay.',
      message: 'Congratulations! Please acknowledge your promotion letter.',
      title: 'Letter of Promotion', subtitle: 'Private & confidential',
      vars: [CO, DATE, ['employee_name', 'Employee name', 'Meera Kapoor'], ['new_designation', 'New designation', 'Engineering Manager'], ['revised_ctc', 'Revised annual CTC', 'INR 32,00,000'], ['effective_date', 'Effective from', '01 Nov 2026'], ['manager', 'Reporting to', 'Head of Engineering']],
      roles: [['For the Company', 'Designation'], ['Employee acknowledgement', 'Employee ID']],
      paras: [
        'Dear {{employee_name}},',
        'We are delighted to promote you to {{new_designation}} with effect from {{effective_date}}, in recognition of your performance and leadership.',
        'kv:New designation|{{new_designation}}', 'kv:Reporting to|{{manager}}', 'kv:Revised annual CTC|{{revised_ctc}}', 'kv:Effective from|{{effective_date}}',
        'Your new responsibilities are described in the attached role profile. All other terms and conditions of employment remain unchanged.',
        'Congratulations, and thank you for your commitment to {{company_name}}.',
      ],
    },
    {
      key: 'internship_offer', name: 'Internship Offer Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Internship offer with duration, stipend, mentor and certificate terms.',
      message: 'We are happy to offer you an internship. Please sign to accept.',
      title: 'Internship Offer', subtitle: '{{company_name}}',
      vars: [CO, DATE, ['intern_name', 'Intern name', 'Sneha Reddy'], ['college', 'College / university', 'IIIT Hyderabad'], ['role', 'Internship role', 'Data Science Intern'], ['start_date', 'Start date', '05 Jan 2027'], ['duration', 'Duration', '6 months'], ['stipend', 'Monthly stipend', 'INR 30,000'], ['mentor', 'Mentor', 'Kiran Das']],
      roles: [['For the Company', 'Designation'], ['Intern', 'College ID']],
      paras: [
        'Dear {{intern_name}},',
        'We are pleased to offer you an internship as {{role}} at {{company_name}}.',
        'kv:Start date|{{start_date}}', 'kv:Duration|{{duration}}', 'kv:Monthly stipend|{{stipend}}', 'kv:Mentor|{{mentor}}', 'kv:College|{{college}}',
        '# Terms', '- The internship is a learning engagement and does not create an employment relationship.', '- You will keep all Company information confidential and assign to the Company any work you create during the internship.', '- A certificate will be issued on successful completion.', '- Either party may end the internship with seven (7) days\' notice.',
        'Please sign to accept this offer.',
      ],
    },
    {
      key: 'experience_letter', name: 'Experience & Relieving Letter', category: 'HR', ccat: 'hr_offer', letter: true,
      description: 'Certifies service period and relieves the employee; signed by the company only.',
      message: 'Your experience and relieving letter is ready.',
      title: 'Experience and Relieving Letter', subtitle: 'To whom it may concern',
      vars: [CO, DATE, ['employee_name', 'Employee name', 'Ananya Iyer'], ['employee_id', 'Employee ID', 'ACM-0031'], ['designation', 'Last designation', 'Marketing Lead'], ['join_date', 'Date of joining', '15 Jun 2021'], ['last_day', 'Last working day', '30 Sep 2026']],
      roles: [['For the Company', 'Designation']],
      paras: [
        'This is to certify that {{employee_name}} (Employee ID {{employee_id}}) was employed with {{company_name}} from {{join_date}} to {{last_day}}. At the time of leaving, {{employee_name}} held the position of {{designation}}.',
        'We confirm that {{employee_name}} has been relieved of all duties with effect from the close of business on {{last_day}}, and that full and final settlement has been completed.',
        'During this period we found {{employee_name}} to be sincere, hardworking and professional. We wish them every success in their future endeavours.',
      ],
    },
    {
      key: 'employee_ip', name: 'Confidentiality & IP Assignment', category: 'HR', ccat: 'hr_offer',
      description: 'Employee confidentiality and invention assignment agreement.',
      message: 'Please sign the confidentiality and IP assignment agreement.',
      title: 'Employee Confidentiality and IP Assignment Agreement', subtitle: '{{company_name}}',
      vars: [CO, ['employee_name', 'Employee name', 'Priya Sharma']],
      roles: [['For the Company', 'Designation'], ['Employee', 'Employee ID']],
      paras: [
        'This Agreement is between {{company_name}} (the "Company") and {{employee_name}} (the "Employee").',
        '# 1. Confidential information', 'The Employee shall not use or disclose any confidential information of the Company or its clients, during or after employment, except as required for their duties.',
        '# 2. Assignment of work product', 'All inventions, designs, code, documents and other work created by the Employee in the course of employment are assigned to the Company, together with all intellectual property rights in them.',
        '# 3. Prior inventions', 'Any inventions the Employee owned before joining and wishes to exclude must be listed in Schedule 1.',
        '# 4. Return of property', 'On leaving, the Employee shall return all Company devices, documents and data.',
        '# 5. Non-solicitation', 'For twelve (12) months after leaving, the Employee shall not solicit Company employees to leave their employment.',
      ],
    },
    // ---------------------------------------------------------------- Sales & procurement
    {
      key: 'consulting', name: 'Consulting Agreement', category: 'Sales', ccat: 'commercial',
      description: 'Engagement of an independent consultant with scope, fees and IP terms.',
      message: 'Here is our consulting agreement for your review and signature.',
      title: 'Consulting Agreement', subtitle: '{{company_name}} and {{consultant}}',
      vars: [CO, ['consultant', 'Consultant', 'Kiran Das Consulting'], ['scope', 'Scope of services', 'a security review of the payments platform'], ['fees', 'Fees', 'INR 2,50,000 plus GST'], ['term', 'Term', '3 months'], CITY],
      roles: [['Client', 'Designation'], ['Consultant', 'PAN / GSTIN']],
      paras: [
        '{{company_name}} (the "Client") engages {{consultant}} (the "Consultant") on the following terms.',
        '# 1. Services', 'The Consultant shall provide {{scope}} (the "Services") over a term of {{term}}.',
        '# 2. Fees and payment', 'The Client shall pay {{fees}}. Invoices are payable within fifteen (15) days, subject to TDS as applicable.',
        '# 3. Independent contractor', 'The Consultant is an independent contractor and is responsible for its own taxes, insurance and equipment.',
        '# 4. Intellectual property', 'Deliverables created for the Client become the Client\'s property on payment. The Consultant keeps its pre-existing know-how and tools.',
        '# 5. Confidentiality', 'The Consultant shall keep all Client information confidential during and after the term.',
        '# 6. Termination and law', 'Either party may terminate with fourteen (14) days\' written notice. Governed by Indian law; courts at {{city}} have jurisdiction.',
      ],
    },
    {
      key: 'freelance', name: 'Freelance Service Agreement', category: 'Sales', ccat: 'commercial',
      description: 'Scope, payment and IP terms for a client engaging an independent contractor.',
      message: 'Here is our service agreement for your review and signature.',
      title: 'Freelance Service Agreement', subtitle: 'Independent contractor engagement',
      vars: [['client', 'Client', 'Acme Studio Pvt. Ltd.'], ['freelancer', 'Freelancer', 'Arjun Mehta'], ['project', 'Project', 'brand identity and website design'], ['fee', 'Fee', 'INR 1,20,000'], ['delivery', 'Delivery date', '15 Dec 2026']],
      roles: [['Client', 'Company'], ['Contractor', 'PAN / Tax ID']],
      paras: [
        'This Service Agreement is between {{client}} (the "Client") and {{freelancer}} (the "Contractor").',
        '# 1. Services', 'The Contractor will deliver {{project}} by {{delivery}}, in a professional and workmanlike manner.',
        '# 2. Payment', 'The Client will pay {{fee}}: 50% on signature and 50% on delivery. Invoices are payable within fifteen (15) days.',
        '# 3. Independent contractor', 'The Contractor is not an employee of the Client and is responsible for its own taxes and equipment.',
        '# 4. Intellectual property', 'On full payment, final deliverables belong to the Client. The Contractor may show the work in its portfolio unless the Client objects in writing.',
        '# 5. Termination', 'Either party may terminate with fourteen (14) days\' written notice; the Client pays for work done up to that date.',
      ],
    },
    {
      key: 'vendor', name: 'Vendor Supply Agreement', category: 'Procurement', ccat: 'commercial',
      description: 'Terms for buying goods from a supplier: pricing, delivery, quality and warranty.',
      message: 'Please review and sign the supply agreement.',
      title: 'Vendor Supply Agreement', subtitle: '{{company_name}} and {{vendor}}',
      vars: [CO, ['vendor', 'Vendor', 'Sri Lakshmi Electronics'], ['goods', 'Goods', 'laptops and peripherals'], ['payment_terms', 'Payment terms', '30 days from invoice'], ['warranty', 'Warranty', '12 months']],
      roles: [['Buyer', 'Designation'], ['Vendor', 'GSTIN']],
      paras: [
        'This Agreement is between {{company_name}} (the "Buyer") and {{vendor}} (the "Vendor") for the supply of {{goods}}.',
        '# 1. Orders', 'The Buyer will place purchase orders stating quantities, prices and delivery dates. Each accepted order forms part of this Agreement.',
        '# 2. Delivery and acceptance', 'Goods must be delivered to the address on the order. The Buyer may reject goods that are damaged or do not meet specifications within seven (7) days of delivery.',
        '# 3. Price and payment', 'Prices are as stated in the order and include packing and delivery unless stated otherwise. Payment terms: {{payment_terms}}, against a valid GST invoice.',
        '# 4. Warranty', 'The Vendor warrants that goods are new, of merchantable quality and free from defects for {{warranty}} from delivery.',
        '# 5. Compliance', 'The Vendor shall comply with all applicable laws, including labour, environmental and anti-bribery laws.',
      ],
    },
    {
      key: 'sales_order', name: 'Quotation Acceptance', category: 'Sales', ccat: 'sales',
      description: 'Customer signs to accept a quotation and its commercial terms.',
      message: 'Please sign to accept our quotation.',
      title: 'Quotation Acceptance', subtitle: 'Quotation {{quote_no}}',
      vars: [CO, ['customer', 'Customer', 'Bluefin Analytics Pvt. Ltd.'], ['quote_no', 'Quotation number', 'Q-2026-0418'], ['amount', 'Total amount', 'INR 4,80,000 plus GST'], ['validity', 'Valid until', '31 Oct 2026']],
      roles: [['Supplier', 'Designation'], ['Customer', 'Purchase order number']],
      paras: [
        '{{customer}} accepts quotation {{quote_no}} issued by {{company_name}} on the terms below.',
        'kv:Quotation|{{quote_no}}', 'kv:Total amount|{{amount}}', 'kv:Valid until|{{validity}}', 'kv:Payment|40% advance, 60% on delivery',
        'Work starts once the advance is received. Prices exclude applicable taxes. Any change in scope will be quoted separately.',
      ],
    },
    // ---------------------------------------------------------------- Finance & real estate
    {
      key: 'loan', name: 'Loan Agreement', category: 'Finance', ccat: 'loan',
      description: 'Simple loan between two parties with repayment schedule and interest.',
      message: 'Please review and sign the loan agreement.',
      title: 'Loan Agreement', subtitle: 'Between {{lender}} and {{borrower}}',
      vars: [['lender', 'Lender', 'Vamshi Rao'], ['borrower', 'Borrower', 'Acme Studio Pvt. Ltd.'], ['principal', 'Principal amount', 'INR 10,00,000'], ['interest', 'Interest rate (p.a.)', '10%'], ['tenure', 'Repayment period', '24 monthly instalments']],
      roles: [['Lender', 'PAN'], ['Borrower', 'PAN / CIN']],
      paras: [
        '{{lender}} (the "Lender") agrees to lend {{borrower}} (the "Borrower") the sum of {{principal}} on the following terms.',
        'kv:Principal|{{principal}}', 'kv:Interest|{{interest}} per annum, simple interest', 'kv:Repayment|{{tenure}}', 'kv:Prepayment|Allowed without penalty',
        '# Default', 'If any instalment is more than thirty (30) days overdue, the full outstanding amount becomes immediately payable.',
        '# Stamp duty', 'The Borrower shall pay any stamp duty payable on this Agreement before it is executed.',
      ],
    },
    {
      key: 'rental', name: 'Residential Rental Agreement', category: 'Real Estate', ccat: 'lease',
      description: 'Eleven-month leave and licence agreement covering rent, deposit and maintenance.',
      message: 'Please review and sign the rental agreement.',
      title: 'Residential Rental Agreement', subtitle: 'Leave and licence of residential premises',
      vars: [['landlord', 'Landlord', 'Ravi Kumar'], ['tenant', 'Tenant', 'Meera Kapoor'], ['address', 'Property address', 'Flat 4B, Road No. 12, Banjara Hills, Hyderabad'], ['rent', 'Monthly rent', 'INR 45,000'], ['deposit', 'Security deposit', 'INR 1,35,000'], ['start', 'Start date', '01 Nov 2026']],
      roles: [['Landlord', 'Phone'], ['Tenant', 'Permanent address']],
      paras: [
        'This Agreement is between {{landlord}} (the "Landlord") and {{tenant}} (the "Tenant") for the premises at {{address}} (the "Premises").',
        'kv:Start date|{{start}}', 'kv:Term|11 months', 'kv:Monthly rent|{{rent}}, payable by the 5th', 'kv:Security deposit|{{deposit}}, refundable', 'kv:Notice|1 month by either party',
        '# Use and maintenance', 'The Tenant shall use the Premises only as a residence, keep it in good condition and pay electricity and internet bills. The Landlord handles structural repairs and society maintenance.',
        '# Deposit refund', 'The deposit will be refunded within thirty (30) days of vacating, less unpaid dues and damage beyond normal wear and tear.',
      ],
    },
    // ---------------------------------------------------------------- Consents
    {
      key: 'patient_consent', name: 'Patient Consent Form', category: 'Healthcare', ccat: 'healthcare',
      description: 'Informed consent for a procedure, including risks and data processing.',
      message: 'Please read and sign the consent form before your appointment.',
      title: 'Informed Consent for Treatment', subtitle: '{{clinic}}',
      vars: [['clinic', 'Clinic / hospital', 'Sunrise Dental Clinic'], ['patient', 'Patient name', 'Rohan Gupta'], ['procedure', 'Procedure', 'root canal treatment'], ['doctor', 'Doctor', 'Dr. Anita Rao']],
      roles: [['Patient or guardian', 'Phone'], ['Doctor', 'Registration no.']],
      paras: [
        'I, {{patient}}, consent to {{procedure}} to be performed by {{doctor}} at {{clinic}}.',
        'The nature of the procedure, its expected benefits, possible risks and complications, and alternative treatments have been explained to me in a language I understand, and I have had the opportunity to ask questions.',
        'I consent to the collection and use of my health information for my treatment, billing and legally required records, in line with applicable data protection law. I may withdraw consent for non-essential processing at any time.',
        'I understand that I may refuse or stop treatment at any time.',
      ],
    },
    {
      key: 'media_consent', name: 'Photo & Media Consent Form', category: 'General', ccat: 'commercial',
      description: 'Single-signer release permitting use of photographs and video.',
      message: 'Please sign the media consent form.',
      title: 'Photo & Media Consent Form', subtitle: 'Release for use of images and recordings',
      vars: [CO, ['event', 'Event or activity', 'the Annual Design Summit 2026']],
      roles: [['Participant', 'Phone or email']],
      paras: [
        'I permit {{company_name}} to use photographs, video and audio recordings of me taken at {{event}} for communications, marketing and educational purposes.',
        'I understand these materials may appear in print, on websites and on social media, and I waive any right to approve the finished materials or to receive compensation.',
        'I may withdraw this consent at any time by written notice; withdrawal applies to future uses only.',
        'I confirm that I am at least 18 years old and have read and understood this form.',
      ],
    },
  ];

  /** Replace {{vars}}; missing values become [Label]. */
  function fillText(text, def, values) {
    return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
      const v = values && values[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
      const meta = (def.vars || []).find((x) => x[0] === k);
      return `[${meta ? meta[1] : k}]`;
    });
  }
  const exampleValues = (def) => Object.fromEntries((def.vars || []).map(([k, , ex]) => [k, ex]));

  const api = { LIBRARY, fillText, exampleValues, byKey: Object.fromEntries(LIBRARY.map((d) => [d.key, d])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SFTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
