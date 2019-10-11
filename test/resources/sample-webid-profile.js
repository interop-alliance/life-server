module.exports = `
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix pim: <http://www.w3.org/ns/pim/space#>.
@prefix schema: <http://schema.org/>.
@prefix ldp: <http://www.w3.org/ns/ldp#>.

<>
    a foaf:PersonalProfileDocument ;
    foaf:primaryTopic <#me> .

<#me>
    a schema:Person ;

    solid:account </> ;  # link to the account uri
    pim:storage </> ;    # root storage

    solid:oidcIssuer <https://provider.com> .
`
