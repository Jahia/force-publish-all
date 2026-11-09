import org.jahia.services.content.JCRTemplate

// Toggle the ACL inheritance break flag on a node (system session, EDIT workspace).
// Replacements: NODE_PATH (absolute path), ACL_BREAK (true|false).
JCRTemplate.instance.doExecuteWithSystemSession { session ->
    def node = session.getNode("NODE_PATH")
    node.setAclInheritanceBreak(ACL_BREAK)
    session.save()
    "ACL inheritance break set to ACL_BREAK on NODE_PATH"
}
