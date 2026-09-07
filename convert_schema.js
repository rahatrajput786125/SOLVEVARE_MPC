const fs = require('fs');

const schemaPath = 'packages/database/prisma/schema.prisma';
let content = fs.readFileSync(schemaPath, 'utf8');

// Replace any occurrence of @db.Uuid
content = content.replace(/@db\.Uuid/g, '@db.ObjectId');

// Replace @db.Date and @db.Text
content = content.replace(/@db\.Text/g, '');
content = content.replace(/@db\.Date/g, '');

// Fix duplicated indexes. If a field is unique, remove the index for it.
// e.g. stripeCustomerId String? @unique, then @@index([stripeCustomerId])
const lines = content.split('\n');
const newLines = [];
let currentModelUniqueFields = [];

for (let line of lines) {
  if (line.includes('model ')) {
    currentModelUniqueFields = [];
  }
  
  // Find @unique fields
  const uniqueMatch = line.match(/^\s+(\w+).*@unique/);
  if (uniqueMatch) {
    currentModelUniqueFields.push(uniqueMatch[1]);
  }
  
  // Check if this line is an @@index with only one field that is already unique
  const indexMatch = line.match(/^\s+@@index\(\[([^\]]+)\]\)/);
  if (indexMatch) {
    const fields = indexMatch[1].split(',').map(f => f.trim());
    if (fields.length === 1 && currentModelUniqueFields.includes(fields[0])) {
      continue; // Skip this @@index
    }
  }
  
  newLines.push(line);
}

content = newLines.join('\n');

fs.writeFileSync(schemaPath, content);
console.log("Schema polished");
