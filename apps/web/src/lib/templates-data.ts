import { type ContractDraft } from "./pdf-builder";

export type AgreementTemplate = {
  id: string;
  title: string;
  category: "General & Legal" | "Employment & HR" | "Sales & Services" | "Tech & IP";
  badge: string;
  description: string;
  estimatedMinutes: number;
  roles: { roleName: string; description: string }[];
  draft: ContractDraft;
};

export const STANDARD_TEMPLATES: AgreementTemplate[] = [
  {
    id: "mutual-nda",
    title: "Mutual Non-Disclosure Agreement (NDA)",
    category: "General & Legal",
    badge: "Standard",
    description: "Bilateral confidentiality agreement protecting proprietary information exchanged between two collaborating companies or parties.",
    estimatedMinutes: 3,
    roles: [
      { roleName: "Disclosing Party", description: "Company sharing proprietary confidential records." },
      { roleName: "Receiving Party", description: "Counterparty agreeing to non-disclosure restrictions." },
    ],
    draft: {
      title: "Mutual Non-Disclosure & Confidentiality Agreement",
      subtitle: "Standard Bilateral Commercial Protective Agreement",
      effectiveDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      partyA: {
        name: "Enterprise Provider Inc.",
        company: "Disclosing Organization",
        email: "legal@enterprise-sign.internal",
      },
      partyB: {
        name: "Partner Organization LLC",
        company: "Counterparty Client",
        email: "representative@partnerorg.com",
      },
      sections: [
        {
          heading: "Purpose & Scope",
          body: "The parties desire to explore mutually beneficial business and technical opportunities. In connection therewith, each party ('Disclosing Party') may disclose to the other party ('Receiving Party') certain non-public, proprietary business and technical data.",
        },
        {
          heading: "Definition of Confidential Information",
          body: "Confidential Information includes all tangible and intangible materials, trade secrets, software architecture, product roadmaps, customer lists, financials, and communications designated as confidential or which reasonably should be understood to be confidential.",
        },
        {
          heading: "Obligations of Receiving Party",
          body: "The Receiving Party agrees to hold and maintain the Confidential Information in strictest confidence, using at least the same degree of care it uses to protect its own sensitive data, but no less than a reasonable standard of care. Information shall only be disclosed to employees and advisors with a strict need to know.",
        },
        {
          heading: "Term & Return of Materials",
          body: "The confidentiality obligations hereunder shall survive for a period of three (3) years from the Effective Date. Upon written request, Receiving Party shall promptly return or certify the permanent destruction of all copies of Confidential Information.",
        },
        {
          heading: "Governing Law & Jurisdiction",
          body: "This Agreement shall be construed and governed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.",
        },
      ],
      footerNote: "Digital Cryptographic Verification Guaranteed · Signing Platform Security",
    },
  },
  {
    id: "contractor-agreement",
    title: "Independent Contractor Services Agreement",
    category: "Sales & Services",
    badge: "Popular",
    description: "Comprehensive agreement for hiring freelancers, independent specialists, and contractors with clear scope, payment terms, and IP assignment.",
    estimatedMinutes: 4,
    roles: [
      { roleName: "Client / Company", description: "Entity engaging the contractor services." },
      { roleName: "Contractor", description: "Independent professional providing deliverables." },
    ],
    draft: {
      title: "Independent Contractor Services Agreement",
      subtitle: "Professional Services & Work-for-Hire Terms",
      effectiveDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      partyA: {
        name: "Client Organization Corp",
        company: "Engaging Company",
        email: "contracts@company.com",
      },
      partyB: {
        name: "Independent Specialist",
        company: "Professional Contractor",
        email: "specialist@consulting.io",
      },
      sections: [
        {
          heading: "Services & Statement of Work",
          body: "Contractor agrees to perform the professional services, engineering deliverables, and milestone requirements described in the Statement of Work with high professional diligence and expertise.",
        },
        {
          heading: "Compensation & Invoicing",
          body: "Client shall pay Contractor the agreed hourly rate or milestone-based fee upon receipt of itemized invoices. Invoices shall be processed net thirty (30) days from verified receipt.",
        },
        {
          heading: "Independent Contractor Status",
          body: "Contractor is an independent contractor and not an employee, agent, or partner of Client. Contractor is solely responsible for all federal, state, and local tax withholdings, insurance, and benefits.",
        },
        {
          heading: "Ownership of Work Product & IP Transfer",
          body: "All deliverables, software, designs, algorithms, and documentation developed by Contractor under this Agreement shall constitute 'work made for hire' and remain the sole exclusive property of Client.",
        },
        {
          heading: "Confidentiality & Non-Solicitation",
          body: "Contractor shall maintain the strict confidentiality of all Client proprietary materials and agrees not to solicit Client employees or core clients during the term and for twelve (12) months thereafter.",
        },
      ],
      footerNote: "Standard Contractor Framework · Fully Enforceable E-Signature",
    },
  },
  {
    id: "employment-offer",
    title: "Employment Offer Letter & Terms",
    category: "Employment & HR",
    badge: "HR",
    description: "Formal job offer document detailing role title, compensation, equity incentives, benefits, and standard employment conditions.",
    estimatedMinutes: 3,
    roles: [
      { roleName: "Hiring Manager / HR", description: "Company executive extending the offer." },
      { roleName: "Candidate", description: "Prospective employee accepting the position." },
    ],
    draft: {
      title: "Employment Offer Letter & Terms of Employment",
      subtitle: "Official Career Opportunity & Compensation Confirmation",
      effectiveDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      partyA: {
        name: "Acme Technologies Inc.",
        company: "Human Resources Dept.",
        email: "hr@acmetech.com",
      },
      partyB: {
        name: "Prospective Team Member",
        company: "Candidate",
        email: "candidate@email.com",
      },
      sections: [
        {
          heading: "Position & Reporting",
          body: "We are pleased to offer you the full-time position of Senior Specialist at Acme Technologies Inc. In this role, you will report directly to the VP of Engineering and collaborate across cross-functional teams.",
        },
        {
          heading: "Compensation & Benefits",
          body: "Your starting base salary will be paid semi-monthly in accordance with standard payroll cycles. You will be eligible for comprehensive health, dental, vision coverage, paid time off, and the company 401(k) program.",
        },
        {
          heading: "Equity Incentive Plan",
          body: "Subject to Board of Directors approval, you will be granted stock options pursuant to the company Equity Incentive Plan, subject to standard four-year vesting with a one-year cliff.",
        },
        {
          heading: "At-Will Employment",
          body: "Employment with the Company is at-will, meaning either you or the Company may terminate the employment relationship at any time, with or without cause or advance notice.",
        },
      ],
      footerNote: "Confidential HR Communication · Signed electronically via Signing Workspace",
    },
  },
  {
    id: "consulting-agreement",
    title: "Consulting & Advisory Services Agreement",
    category: "Sales & Services",
    badge: "Advisory",
    description: "Strategic advisory agreement outlining retainer fees, strategic review sessions, board advisory duties, and liability caps.",
    estimatedMinutes: 4,
    roles: [
      { roleName: "Company", description: "Organization receiving advisory counsel." },
      { roleName: "Strategic Advisor", description: "Industry expert providing consultative guidance." },
    ],
    draft: {
      title: "Strategic Advisory & Consulting Agreement",
      subtitle: "Executive Advisory Counsel Terms",
      effectiveDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      partyA: {
        name: "Global Ventures Corp",
        company: "Client",
        email: "executive@globalventures.com",
      },
      partyB: {
        name: "Senior Advisor",
        company: "Advisory Practice",
        email: "advisor@strategyadvisors.com",
      },
      sections: [
        {
          heading: "Scope of Advisory Services",
          body: "Advisor shall provide strategic counsel, market intelligence, high-level business introductions, and executive review sessions up to designated monthly time allocations.",
        },
        {
          heading: "Retainer Fee & Expenses",
          body: "In consideration of Advisory Services, Company shall pay Advisor the agreed monthly retainer fee and reimburse pre-approved reasonable travel and lodging expenses.",
        },
        {
          heading: "Intellectual Property & Advice",
          body: "Strategic guidance is provided on an advisory basis. Any specific custom deliverables and company frameworks created shall belong exclusively to Company.",
        },
        {
          heading: "Limitation of Liability",
          body: "Advisor's total aggregate liability arising out of or related to this Agreement shall be limited to the total fees actually paid to Advisor in the preceding six (6) months.",
        },
      ],
      footerNote: "Advisory Services Framework · Signing Workspace Legal System",
    },
  },
  {
    id: "saas-agreement",
    title: "Software License & SaaS Subscription Agreement",
    category: "Tech & IP",
    badge: "Tech",
    description: "Enterprise software licensing agreement covering service level agreements (SLA), user seats, data privacy, and termination.",
    estimatedMinutes: 4,
    roles: [
      { roleName: "Software Licensor", description: "Vendor providing cloud software access." },
      { roleName: "Enterprise Customer", description: "Subscriber accessing software platform." },
    ],
    draft: {
      title: "Enterprise SaaS & Master Services Agreement",
      subtitle: "Cloud Software Subscription & Data Processing Terms",
      effectiveDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      partyA: {
        name: "CloudTech Platform Systems",
        company: "Licensor",
        email: "sales@cloudtechsystems.io",
      },
      partyB: {
        name: "Enterprise Customer Inc.",
        company: "Subscriber",
        email: "procurement@enterprisecustomer.com",
      },
      sections: [
        {
          heading: "Subscription Grant & Authorized Use",
          body: "Licensor grants Customer a non-exclusive, non-transferable right to access and use the SaaS Platform during the subscription term for internal business operations in accordance with designated user quotas.",
        },
        {
          heading: "Service Level Agreement (SLA) & Support",
          body: "Licensor warrants 99.9% uptime availability excluding scheduled maintenance windows, with 24/7 critical tier incident support response within sixty (60) minutes.",
        },
        {
          heading: "Customer Data & Security Protection",
          body: "Customer retains all ownership rights in Customer Data. Licensor shall maintain enterprise-grade administrative, technical, and physical safeguards including AES-256 encryption at rest and TLS 1.3 in transit.",
        },
        {
          heading: "Payment Terms & Renewals",
          body: "Subscription fees are billed annually in advance. Subscriptions automatically renew for successive twelve-month periods unless written notice of non-renewal is provided thirty (30) days prior to renewal date.",
        },
      ],
      footerNote: "Enterprise SaaS Contract · Immutable Audit Trail Verification",
    },
  },
];
