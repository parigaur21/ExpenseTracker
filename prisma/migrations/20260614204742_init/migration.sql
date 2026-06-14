-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "display_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'INR',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Group_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_on" DATETIME NOT NULL,
    "left_on" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    CONSTRAINT "GroupMembership_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupMembership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "paid_by_user_id" TEXT NOT NULL,
    "expense_date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "original_amount" DECIMAL NOT NULL,
    "original_currency" TEXT NOT NULL,
    "exchange_rate" DECIMAL NOT NULL,
    "converted_amount" DECIMAL NOT NULL,
    "split_type" TEXT NOT NULL,
    "source_import_id" TEXT,
    "source_row_number" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseSplit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expense_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "percentage" DECIMAL,
    "share_units" DECIMAL,
    CONSTRAINT "ExpenseSplit_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "Expense" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseSplit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "paid_by_user_id" TEXT NOT NULL,
    "paid_to_user_id" TEXT NOT NULL,
    "settlement_date" DATETIME NOT NULL,
    "original_amount" DECIMAL NOT NULL,
    "original_currency" TEXT NOT NULL,
    "exchange_rate" DECIMAL NOT NULL,
    "converted_amount" DECIMAL NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Settlement_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_paid_to_user_id_fkey" FOREIGN KEY ("paid_to_user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "accepted_rows" INTEGER NOT NULL,
    "skipped_rows" INTEGER NOT NULL,
    "blocked_rows" INTEGER NOT NULL,
    "review_rows" INTEGER NOT NULL,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Import_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Import_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "import_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "raw_row" TEXT NOT NULL,
    CONSTRAINT "Anomaly_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "Import" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_user_id" TEXT,
    "group_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_group_id_user_id_joined_on_key" ON "GroupMembership"("group_id", "user_id", "joined_on");
