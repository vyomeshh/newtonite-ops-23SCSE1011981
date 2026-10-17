"""Idempotent seed script – populates the database on first startup.

Creates 4 teams, 10 users, 2500+ work items, and 5000+ activity events.
Safe to run multiple times; checks if data exists before inserting.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from app.auth import hash_password
from app.database import SyncSessionLocal, sync_engine
from app.models import (
    ActivityEvent,
    Base,
    EventType,
    ItemType,
    Membership,
    Priority,
    Status,
    Team,
    TeamRole,
    User,
    WorkItem,
)

PASSWORD = "newtonite123"

TEAMS = [
    {"name": "Platform Engineering", "slug": "platform-engineering", "description": "Core infrastructure & platform services"},
    {"name": "Payments & Risk", "slug": "payments-risk", "description": "Payment processing and fraud detection"},
    {"name": "Compliance & Legal", "slug": "compliance-legal", "description": "Regulatory compliance and legal operations"},
    {"name": "Customer Operations", "slug": "customer-operations", "description": "Customer support and success operations"},
]

# 10 users with their team assignments
# Format: (email, full_name, [(team_slug, role), ...])
USERS = [
    ("admin@newtonite.io", "Alice Admin", [("platform-engineering", "ADMIN"), ("payments-risk", "ADMIN"), ("compliance-legal", "ADMIN"), ("customer-operations", "ADMIN")]),
    ("lead.platform@newtonite.io", "Bob Lead", [("platform-engineering", "LEAD")]),
    ("lead.payments@newtonite.io", "Carol Lead", [("payments-risk", "LEAD")]),
    ("lead.compliance@newtonite.io", "Diana Lead", [("compliance-legal", "LEAD")]),
    ("member.platform@newtonite.io", "Eve Member", [("platform-engineering", "MEMBER")]),
    ("member.payments@newtonite.io", "Frank Member", [("payments-risk", "MEMBER")]),
    ("member.compliance@newtonite.io", "Grace Member", [("compliance-legal", "MEMBER")]),
    ("member.custops@newtonite.io", "Hank Member", [("customer-operations", "MEMBER")]),
    ("viewer.platform@newtonite.io", "Ivy Viewer", [("platform-engineering", "VIEWER")]),
    ("external@newtonite.io", "Jack External", [("customer-operations", "VIEWER")]),
]


ITEM_TITLES = {
    ItemType.INCIDENT: [
        "Production API latency spike on {service}",
        "Database connection pool exhaustion",
        "Memory leak in {service} worker",
        "SSL certificate expiry warning for {domain}",
        "Kubernetes pod crash loop in {service}",
        "CDN cache invalidation failure",
        "Load balancer health check failures",
        "DNS resolution timeout for {service}",
        "Disk space critical on {host}",
        "Rate limiter misconfiguration on {endpoint}",
    ],
    ItemType.CUSTOMER_ISSUE: [
        "Customer unable to complete checkout",
        "Account verification email not received",
        "Double charge reported by customer #{cid}",
        "Unable to export transaction history",
        "Mobile app login loop on iOS 17",
        "Incorrect balance shown for customer #{cid}",
        "Subscription renewal failure",
        "Password reset link expired immediately",
        "Webhook delivery failures to partner {partner}",
        "Data export request pending 48+ hours",
    ],
    ItemType.PAYMENT: [
        "Failed settlement batch #{batch}",
        "Stripe webhook delivery failures",
        "Refund processing stuck for order #{order}",
        "Currency conversion discrepancy",
        "PCI compliance scan remediation",
        "Chargeback dispute #{dispute}",
        "Payment gateway timeout errors",
        "ACH batch processing delay",
        "Invoice generation failure for account #{acc}",
        "Tax calculation error for region {region}",
    ],
    ItemType.COMPLIANCE: [
        "GDPR data deletion request #{req}",
        "SOC2 audit evidence collection",
        "Privacy policy update review",
        "Data retention policy violation",
        "Third-party vendor risk assessment",
        "Access control audit for {system}",
        "Regulatory reporting deadline approaching",
        "PII exposure in application logs",
        "Employee background check follow-up",
        "Incident response plan annual review",
    ],
    ItemType.TASK: [
        "Upgrade {library} to latest version",
        "Set up monitoring dashboard for {service}",
        "Document API endpoints for {service}",
        "Performance optimization for {query}",
        "Implement feature flag for {feature}",
        "Database migration for schema v{version}",
        "Configure CI/CD pipeline for {repo}",
        "Security patching sprint",
        "Onboarding documentation update",
        "Capacity planning for Q{quarter}",
    ],
}

TEMPLATE_VARS = {
    "service": ["auth-service", "payment-gateway", "notification-service", "user-api", "analytics-engine"],
    "domain": ["api.acme.com", "dashboard.acme.com", "payments.acme.com"],
    "host": ["prod-db-01", "prod-app-03", "staging-worker-02"],
    "endpoint": ["/api/v2/orders", "/api/v1/users", "/webhooks/stripe"],
    "cid": [str(i) for i in range(10001, 10050)],
    "batch": [str(i) for i in range(5001, 5020)],
    "order": [str(i) for i in range(90001, 90050)],
    "dispute": [str(i) for i in range(7001, 7020)],
    "acc": [str(i) for i in range(20001, 20030)],
    "region": ["EU", "APAC", "NA", "LATAM"],
    "req": [str(i) for i in range(1001, 1030)],
    "system": ["AWS Console", "GitHub", "Jira", "Slack", "PagerDuty"],
    "library": ["React", "FastAPI", "SQLAlchemy", "Next.js", "TanStack Query"],
    "query": ["user-search", "transaction-report", "audit-log-aggregation"],
    "feature": ["dark-mode", "bulk-export", "real-time-notifications"],
    "version": [str(i) for i in range(10, 25)],
    "repo": ["ops-backend", "ops-frontend", "shared-libs"],
    "quarter": ["1 2025", "2 2025", "3 2025", "4 2025"],
    "partner": ["Acme Corp", "Globex", "Initech", "Umbrella"],
}


def _fill_template(template: str) -> str:
    """Fill template placeholders with random values."""
    result = template
    for key, values in TEMPLATE_VARS.items():
        placeholder = "{" + key + "}"
        if placeholder in result:
            result = result.replace(placeholder, random.choice(values))
    return result


def run_seed():
    """Main seed function – idempotent, checks for existing data."""
    session = SyncSessionLocal()
    try:
        # Check if already seeded
        existing = session.query(User).count()
        if existing > 0:
            print("[SEED] Database already seeded. Skipping.")
            return

        print("[SEED] Seeding database...")

        # ---------- Teams ----------
        team_map: dict[str, Team] = {}
        for t in TEAMS:
            team = Team(**t)
            session.add(team)
            session.flush()
            team_map[t["slug"]] = team
        print(f"[SEED] Created {len(TEAMS)} teams.")

        # ---------- Users & Memberships ----------
        hashed_pw = hash_password(PASSWORD)
        user_map: dict[str, User] = {}
        for email, full_name, memberships in USERS:
            u = User(email=email, full_name=full_name, password_hash=hashed_pw)
            session.add(u)
            session.flush()
            user_map[email] = u

            for team_slug, role_str in memberships:
                m = Membership(
                    user_id=u.id,
                    team_id=team_map[team_slug].id,
                    role=TeamRole(role_str),
                )
                session.add(m)

        session.flush()
        print(f"[SEED] Created {len(USERS)} users with memberships.")

        # ---------- Work Items ----------
        all_users = list(user_map.values())
        all_teams = list(team_map.values())
        item_types = list(ItemType)
        priorities = list(Priority)
        statuses = [Status.OPEN, Status.IN_PROGRESS, Status.AWAITING_APPROVAL, Status.RESOLVED, Status.CLOSED]
        now = datetime.now(timezone.utc)

        # We'll create items using bulk insert for performance
        items_to_insert = []
        activity_to_insert = []

        for i in range(2600):
            itype = random.choice(item_types)
            priority = random.choice(priorities)
            team = random.choice(all_teams)
            status_val = random.choice(statuses)

            # Find a valid creator for this team
            team_members = []
            for email, _, mships in USERS:
                for ts, role in mships:
                    if ts == team.slug and TeamRole(role) != TeamRole.VIEWER:
                        team_members.append(user_map[email])
                        break
            if not team_members:
                team_members = [all_users[0]]  # fallback to admin

            creator = random.choice(team_members)

            # Randomly assign
            assignee = random.choice(team_members) if random.random() > 0.3 else None
            if status_val in (Status.IN_PROGRESS, Status.AWAITING_APPROVAL, Status.RESOLVED, Status.CLOSED) and assignee is None:
                assignee = random.choice(team_members)

            title_templates = ITEM_TITLES.get(itype, ITEM_TITLES[ItemType.TASK])
            title = _fill_template(random.choice(title_templates))

            days_ago = random.randint(0, 90)
            created_at = now - timedelta(days=days_ago, hours=random.randint(0, 23))

            due_offset = random.randint(-5, 30)
            due_date = now + timedelta(days=due_offset) if random.random() > 0.4 else None

            version = 1
            if status_val != Status.OPEN:
                version = random.randint(2, 5)

            approved_by = None
            if status_val in (Status.RESOLVED, Status.CLOSED):
                # Find a lead/admin in this team
                for email, _, mships in USERS:
                    for ts, role in mships:
                        if ts == team.slug and role in ("LEAD", "ADMIN"):
                            approved_by = user_map[email]
                            break
                    if approved_by:
                        break

            items_to_insert.append(WorkItem(
                title=title,
                description=f"Auto-generated work item for seed data. Type: {itype.value}, Priority: {priority.value}.",
                item_type=itype,
                priority=priority,
                status=status_val,
                team_id=team.id,
                assignee_id=assignee.id if assignee else None,
                created_by_id=creator.id,
                approved_by_id=approved_by.id if approved_by else None,
                due_date=due_date,
                version=version,
                created_at=created_at,
                updated_at=created_at + timedelta(hours=random.randint(0, 48)),
            ))

        # Bulk add items
        session.bulk_save_objects(items_to_insert)
        session.flush()
        print(f"[SEED] Created {len(items_to_insert)} work items.")

        # Fetch all item IDs for activity events
        all_item_ids = [r[0] for r in session.query(WorkItem.id).all()]
        event_types_for_seed = [
            EventType.ITEM_CREATED, EventType.ITEM_CLAIMED,
            EventType.STATUS_CHANGED, EventType.PRIORITY_CHANGED,
            EventType.DETAILS_UPDATED, EventType.COMMENT_ADDED,
        ]

        comments = [
            "Looking into this now.",
            "Escalated to the team lead.",
            "Waiting for vendor response.",
            "Patch applied, monitoring.",
            "Root cause identified.",
            "Rollback completed successfully.",
            "Customer notified about the fix.",
            "Deployed hotfix to production.",
            "Added to next sprint for follow-up.",
            "Documentation updated.",
            "This needs urgent attention.",
            "Confirmed fix works in staging.",
            "False alarm – closing.",
            "Related to incident #1234.",
            "Compliance review completed.",
        ]

        for j in range(5200):
            item_id = random.choice(all_item_ids)
            actor = random.choice(all_users)
            evt = random.choice(event_types_for_seed)

            days_ago = random.randint(0, 90)
            created_at = now - timedelta(days=days_ago, hours=random.randint(0, 23))

            old_val = None
            new_val = None
            comment = None

            if evt == EventType.STATUS_CHANGED:
                old_val = {"status": random.choice([s.value for s in statuses])}
                new_val = {"status": random.choice([s.value for s in statuses])}
            elif evt == EventType.PRIORITY_CHANGED:
                old_val = {"priority": random.choice([p.value for p in priorities])}
                new_val = {"priority": random.choice([p.value for p in priorities])}
            elif evt == EventType.COMMENT_ADDED:
                comment = random.choice(comments)
            elif evt == EventType.ITEM_CREATED:
                new_val = {"title": "Created via seed"}

            activity_to_insert.append(ActivityEvent(
                work_item_id=item_id,
                actor_id=actor.id,
                event_type=evt,
                old_value=old_val,
                new_value=new_val,
                comment_text=comment,
                created_at=created_at,
            ))

        session.bulk_save_objects(activity_to_insert)
        session.commit()
        print(f"[SEED] Created {len(activity_to_insert)} activity events.")
        print("[SEED] [OK] Seed completed successfully!")

    except Exception as e:
        session.rollback()
        print(f"[SEED] Error: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    run_seed()
